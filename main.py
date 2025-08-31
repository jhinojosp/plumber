import streamlit as st
import pandas as pd
import plotly.express as px
import json
import os

# db imports

import sqlite3
import hashlib
from pathlib import Path

st.set_page_config(page_title="plumber", layout="wide")

# db

DB_PATH = Path("db.db")

def init_db():
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_file TEXT,
            fecha TEXT,
            fecha_compra TEXT,
            descripcion TEXT,
            importe REAL,
            category TEXT,
            tx_key TEXT NOT NULL,
            UNIQUE(tx_key)
        );
    """)
    # Helpful for lookups; optional
    cur.execute("CREATE INDEX IF NOT EXISTS ix_tx_trip ON transactions (fecha, descripcion, importe);")

    # NEW: remember imported files to avoid re-ingesting the same file
    cur.execute("""
        CREATE TABLE IF NOT EXISTS file_imports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_name TEXT,
            file_hash TEXT UNIQUE,
            imported_at TEXT DEFAULT (datetime('now'))
        );
    """)
    con.commit()
    con.close()

category_file = "categories.json"

if "categories" not in st.session_state:
    st.session_state.categories = {
        "Uncategorized": []
    }

if os.path.exists(category_file):
    with open(category_file, "r") as f:
        st.session_state.categories = json.load(f)

def save_categories():
    with open(category_file, "w") as f:
        json.dump(st.session_state.categories, f)

def categorized_transactions(df):
    df["Category"] = "Uncategorized"
    
    for category, keywords in st.session_state.categories.items():
        if category == "Uncategorized" or not keywords:
            continue
        lowered_keywords = [keyword.lower().strip() for keyword in keywords]

        for idx, row in df.iterrows():
            description = row["Descripción"].lower().strip()
            if description in lowered_keywords:
                df.at[idx, "Category"] = category
    return df

def load_transactions(file):
    try:
        df = pd.read_csv(file)
        df.columns = [col.strip() for col in df.columns]
        df["Importe"] = df["Importe"].astype(float)
        df["Fecha"] = pd.to_datetime(df["Fecha"], format="%d %b %Y")
        df["Fecha de Compra"] = pd.to_datetime(df["Fecha de Compra"], format="%d %b %Y")
        return categorized_transactions(df)
    except Exception as e:
        st.error(f"Error processing file:{str(e)}")
        return None

# Helpers to build indempotency key and persist rows

## temporar summary of db

def db_summary():
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute("SELECT COUNT(*) FROM transactions;")
    row_count = cur.fetchone()[0]
    con.close()

    size_bytes = os.path.getsize(DB_PATH) if DB_PATH.exists() else 0
    size_mb = size_bytes / (1024 * 1024)

    st.caption(f"📦 Database: {row_count:,} rows — {size_mb:.2f} MB")
 ## --------------------------

def file_sha256(file_bytes: bytes) -> str:
    return hashlib.sha256(file_bytes).hexdigest()

def is_already_imported(file_hash: str) -> bool:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute("SELECT 1 FROM file_imports WHERE file_hash = ? LIMIT 1;", (file_hash,))
    row = cur.fetchone()
    con.close()
    return row is not None

def record_import(file_name: str, file_hash: str) -> None:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute("INSERT OR IGNORE INTO file_imports (file_name, file_hash) VALUES (?, ?);", (file_name, file_hash))
    con.commit()
    con.close()

def _tx_key(fecha_iso: str, descripcion: str, importe: float, seq: int) -> str:
    """
    date + normalized description + amount + sequence index.
    The seq disambiguates multiple same-day/same-amount/same-desc purchases.
    """
    norm_desc = (descripcion or "").strip().lower()
    basis = f"{fecha_iso}|{norm_desc}|{importe:.2f}|{seq}"
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()

def persist_transactions(df: pd.DataFrame, source_name: str):
    """
    Insert only the delta beyond what's already stored per (fecha, descripcion, importe) triple.
    Keeps your existing _tx_key(fecha, desc, importe, seq).
    """
    if df is None or df.empty:
        return 0, 0

    df = df.copy()
    df["Fecha_iso"] = pd.to_datetime(df["Fecha"]).dt.strftime("%Y-%m-%d")
    df["FechaCompra_iso"] = pd.to_datetime(df["Fecha de Compra"]).dt.strftime("%Y-%m-%d")
    df["norm_desc"] = df["Descripción"].astype(str).str.strip().str.lower()
    df["imp2d"] = df["Importe"].astype(float).round(2)

    grp = ["Fecha_iso", "norm_desc", "imp2d"]
    batch_counts = df.groupby(grp).size().to_dict()

    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    # existing counts per triple
    existing_counts = {}
    for (fecha_iso, norm_desc, imp2d), _ in batch_counts.items():
        cur.execute("""
            SELECT COUNT(*) FROM transactions
            WHERE fecha = ? AND LOWER(TRIM(descripcion)) = ? AND ROUND(importe, 2) = ?
        """, (fecha_iso, norm_desc, float(imp2d)))
        existing_counts[(fecha_iso, norm_desc, float(imp2d))] = cur.fetchone()[0]

    # how many to insert per triple this batch
    allowed = {k: max(0, batch_counts[k] - existing_counts.get(k, 0)) for k in batch_counts}
    running = {k: 0 for k in batch_counts}  # inserted so far in this batch per triple

    inserted, skipped = 0, 0
    for _, r in df.iterrows():
        key = (r["Fecha_iso"], r["norm_desc"], float(r["imp2d"]))
        need = allowed.get(key, 0)
        if running.get(key, 0) >= need:
            skipped += 1
            continue

        # global sequence index for this occurrence = existing + running
        seq = existing_counts.get(key, 0) + running.get(key, 0)
        tx_key = _tx_key(r["Fecha_iso"], r["Descripción"], float(r["imp2d"]), seq)

        try:
            cur.execute("""
                INSERT OR IGNORE INTO transactions
                (source_file, fecha, fecha_compra, descripcion, importe, category, tx_key)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                source_name,
                r["Fecha_iso"],
                r["FechaCompra_iso"],
                r["Descripción"],
                float(r["imp2d"]),
                r.get("Category", "Uncategorized"),
                tx_key
            ))
            if cur.rowcount == 1:
                inserted += 1
                running[key] += 1
            else:
                skipped += 1
        except Exception:
            skipped += 1

    con.commit()
    con.close()
    return inserted, skipped

def load_all_transactions() -> pd.DataFrame:
    con = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query("""
        SELECT fecha AS Fecha,
               fecha_compra AS "Fecha de Compra",
               descripcion AS "Descripción",
               importe AS Importe,
               category AS Category,
               source_file
        FROM transactions
        ORDER BY fecha DESC, id DESC
    """, con)
    con.close()
    # Cast back to date dtype for UI niceties
    if not df.empty:
        df["Fecha"] = pd.to_datetime(df["Fecha"])
        df["Fecha de Compra"] = pd.to_datetime(df["Fecha de Compra"])
    return df

# -----------------------------------------------------------------

def add_keyword_to_category(category, keyword):
    keyword = keyword.strip()
    if keyword and keyword not in st.session_state.categories[category]:
        st.session_state.categories[category].append(keyword)
        save_categories()
        return True

def main():
    st.title("plumber")

    # ensure db exists
    init_db()

    # show summary at the top
    db_summary()


    uploaded_file = st.file_uploader("Upload CSV file", type=["CSV"])

    if uploaded_file is not None:

        # compute hash of the raw bytes to detect exact re-uploads
        file_bytes = uploaded_file.getvalue()
        fhash = file_sha256(file_bytes)
        fname = getattr(uploaded_file, "name", "uploaded.csv")

        if is_already_imported(fhash):
            st.info(f"File already imported: {fname}. No rows added.")
            # OPTIONAL: still show your current DB summary or skip the rest.
            return

        df = load_transactions(uploaded_file)

        if df is not None:
            
            # persist to DB (use uploaded file name as source id)
            inserted, skipped = persist_transactions(df, getattr(uploaded_file, "name", "uploaded.csv"))
            record_import(fname, fhash)
            st.success(f"Saved to database — Inserted: {inserted}, Skipped (duplicates): {skipped}")


            debits_df = df[df["Importe"] > 0].copy()
            credits_df = df[df["Importe"] <= 0].copy()
            
            st.session_state.debits_df = debits_df.copy()

            tab1, tab2 = st.tabs(["Expenses", "Payments"])
            with tab1:
                new_category = st.text_input("New category name")
                add_button = st.button("Add category")

                if add_button and new_category:
                    if new_category not in st.session_state.categories:
                        st.session_state.categories[new_category] = []
                        save_categories()
                        st.rerun()
                st.subheader("Your expenses")
                edited_df = st.data_editor(
                    st.session_state.debits_df[["Fecha", "Descripción", "Importe", "Category"]],
                    column_config={
                        "Fecha": st.column_config.DateColumn("Date", format="YYYY-MM-DD"),
                        "Importe": st.column_config.NumberColumn("Amount", format="%0.2f"),
                        "Category": st.column_config.SelectboxColumn(
                            "Category", options=list(st.session_state.categories.keys())
                        )
                    },
                    hide_index=True,
                    use_container_width=True,
                    key="category_editor"
                )

                save_button = st.button("Apply changes", type="primary")
                if save_button:
                    for idx, row in edited_df.iterrows():
                        new_category = row["Category"]
                        if new_category == st.session_state.debits_df.at[idx, "Category"]:
                            continue
                        description = row["Descripción"]
                        st.session_state.debits_df.at[idx, "Category"] = new_category
                        add_keyword_to_category(new_category, description)
                st.subheader("Expense summary")
                category_totals = st.session_state.debits_df.groupby("Category")["Importe"].sum().reset_index()
                category_totals = category_totals.sort_values("Importe", ascending=False)

                st.dataframe(
                    category_totals,
                    column_config={
                        "Importe": st.column_config.NumberColumn("Amount", format="accounting")
                    },
                    use_container_width=True,
                    hide_index=True
                )

                fig = px.pie(
                    category_totals,    
                    values="Importe",
                    names="Category",
                    title="Expenses by Category"
                )
                st.plotly_chart(fig, use_container_width=True)

            with tab2:
                st.subheader("Total payments")
                total_payments = credits_df["Importe"].sum()
                st.metric("Total payments", f"{total_payments:,.2f}")
                st.write(credits_df)

main()