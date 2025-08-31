import streamlit as st
import pandas as pd
import plotly.express as px
import json
import os

st.set_page_config(page_title="Finance Tracker", layout="wide")

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

def add_keyword_to_category(category, keyword):
    keyword = keyword.strip()
    if keyword and keyword not in st.session_state.categories[category]:
        st.session_state.categories[category].append(keyword)
        save_categories()
        return True

def main():
    st.title("Finance Tracker")

    upoloaded_file = st.file_uploader("Upload CSV file", type=["CSV"])

    if upoloaded_file is not None:
        df = load_transactions(upoloaded_file)

        if df is not None:
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
