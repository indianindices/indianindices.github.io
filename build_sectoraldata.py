from datetime import date
from math import isfinite, prod
from pathlib import Path
import argparse

import pandas as pd
import requests
import yfinance as yf
from openpyxl import Workbook, load_workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter


ROOT = Path(__file__).parent
CSV_PATH = ROOT / "sectoraldata.csv"
XLSX_PATH = ROOT / "sectoraldata.xlsx"

NIFTY50 = [
    ["5Yr Avg", -3.16, 4.76, 1.54, 2.57, 5.74],
    [2026, -14.54, 6.87, -6.90, 0.00, -14.96],
    [2025, -0.53, 8.49, -3.55, 6.17, 10.51],
    [2024, 2.74, 7.54, 7.50, -8.39, 8.80],
    [2023, -4.12, 10.54, 2.34, 10.66, 20.03],
    [2022, 0.64, -9.65, 8.33, 5.91, 4.33],
    [2021, 5.07, 7.02, 12.06, -1.50, 24.12],
    [2020, -29.34, 19.82, 9.18, 24.31, 14.90],
    [2019, 7.01, 1.42, -2.67, 6.05, 12.02],
    [2018, -3.96, 5.94, 2.02, -0.62, 3.15],
    [2017, 12.07, 3.78, 2.81, 7.58, 28.65],
    [2016, -2.62, 7.10, 3.90, -4.94, 3.01],
    [2015, 2.51, -1.44, -5.01, -0.03, -4.06],
    [2014, 6.35, 13.53, 4.64, 3.99, 31.39],
    [2013, -3.77, 2.81, -1.83, 9.92, 6.76],
    [2012, 14.52, -0.31, 8.04, 3.54, 27.70],
    [2011, -4.90, -3.19, -12.47, -6.45, -24.62],
    [2010, 0.92, 1.21, 13.50, 1.73, 17.95],
    [2009, 2.09, 42.04, 18.48, 2.30, 75.76],
    [2008, -22.87, -14.66, -2.95, -24.53, -51.79],
    [2007, -3.65, 13.00, 16.28, 22.25, 54.77],
    [2006, 19.98, -8.06, 14.71, 10.53, 39.86],
]

REQUESTED = [
    "Next50", "IT", "Infra", "Consumption", "Energy", "Healthcare", "Pharma",
    "Auto", "Alpha50", "FMCG", "Metal", "BankNifty", "PSUBanks", "PrivateBank",
    "SmallCap50", "SmallCap100", "SmallCap250", "Midcap50", "Midcap100",
    "Midcap150", "Nifty200 Momentum30", "Realty", "Commodities", "Oil and gas", "CPSE",
]

# Yahoo symbols are used only where a public historical series is available.
SYMBOLS = {
    "Next50": "^NSMIDCP",
    "IT": "^CNXIT",
    "Infra": "^CNXINFRA",
    "Energy": "^CNXENERGY",
    "Pharma": "^CNXPHARMA",
    "Auto": "^CNXAUTO",
    "FMCG": "^CNXFMCG",
    "Metal": "^CNXMETAL",
    "BankNifty": "^NSEBANK",
    "PSUBanks": "^CNXPSUBANK",
    "SmallCap50": "^NSEMDCP50",
}

TRENDLYNE_IDS = {
    "Next50": 1888,
    "IT": 1902,
    "Infra": 1911,
    "Consumption": 1909,
    "Energy": 1899,
    "Healthcare": 910417,
    "Pharma": 1905,
    "Auto": 1897,
    "Alpha50": 1926,
    "FMCG": 1901,
    "Metal": 1904,
    "BankNifty": 1898,
    "PSUBanks": 1906,
    "PrivateBank": 910338,
    "SmallCap50": 910396,
    "SmallCap100": 1896,
    "SmallCap250": 910398,
    "Midcap50": 1894,
    "Midcap100": 1895,
    "Midcap150": 910393,
    "Nifty200 Momentum30": 910414,
    "Realty": 1907,
    "Commodities": 1908,
    "Oil and gas": 910411,
    "CPSE": 1910,
}


def quarterly_returns(symbol):
    prices = yf.download(symbol, start="2005-01-01", end="2026-10-02", auto_adjust=False, progress=False, threads=False)["Close"]
    if isinstance(prices, pd.DataFrame):
        prices = prices.iloc[:, 0]
    prices = prices.dropna()
    if prices.empty:
        return []
    quarter_end = prices.resample("QE").last()
    previous_year_end = prices.resample("YE").last().shift(1)
    result = []
    for year, group in quarter_end.groupby(quarter_end.index.year):
        base = previous_year_end[previous_year_end.index.year == year].iloc[0] if not previous_year_end[previous_year_end.index.year == year].empty else None
        if base is None or pd.isna(base):
            continue
        values = [((group.iloc[i] / (base if i == 0 else group.iloc[i - 1])) - 1) * 100 for i in range(min(4, len(group)))]
        if len(values) != 4:
            continue
        annual = ((group.iloc[-1] / base) - 1) * 100
        result.append([year, *[round(float(value), 2) for value in values], round(float(annual), 2)])
    return sorted(result, reverse=True)


def trendlyne_quarterly_returns(index_id):
    response = requests.get(
        f"https://trendlyne.com/share-price/price-performance-analysis/{index_id}",
        headers={
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/150 Safari/537.36",
            "Referer": "https://trendlyne.com/",
        },
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()["body"]["returnsPatternData"]["Quarterly"]
    rows = []
    for year, values in payload.items():
        quarter_values = {item["m"]: item["v"] for item in values if "m" in item}
        annual = next(item["v"] for item in values if "y" in item)
        label = "5Yr Avg" if year == "5Yr Avg" else int(year)
        rows.append([label, *[quarter_values.get(month, 0) for month in (3, 6, 9, 12)], annual])
    return rows


def write_sheet(workbook, name, rows, note=None):
    sheet = workbook.create_sheet(name[:31])
    headers = ["Year", "Q1", "Q2", "Q3", "Q4", "Annual Returns"]
    sheet.append(headers)
    for row in rows:
        sheet.append(row)
    if note:
        sheet.cell(row=sheet.max_row + 2, column=1, value=note)
    for cell in sheet[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="1F4E78")
        cell.alignment = Alignment(horizontal="center")
    for row in sheet.iter_rows(min_row=2, max_row=1 + len(rows), min_col=2, max_col=6):
        for cell in row:
            cell.number_format = "0.00%;[Red]-0.00%"
            cell.value = cell.value / 100 if isinstance(cell.value, (int, float)) else cell.value
            if isinstance(cell.value, (int, float)):
                cell.fill = PatternFill("solid", fgColor="E2F0D9" if cell.value >= 0 else "FCE4D6")
    for column in range(1, 7):
        sheet.column_dimensions[get_column_letter(column)].width = 18 if column > 1 else 14
    sheet.freeze_panes = "B2"


def add_cagr(workbook):
    for sheet in workbook.worksheets:
        header = sheet.cell(1, 7, "5Y CAGR (Calculated)")
        header.font = Font(bold=True, color="FFFFFF")
        header.fill = PatternFill("solid", fgColor="1F4E78")
        header.alignment = Alignment(horizontal="center")
        header.comment = Comment(
            "Geometric annualized return from five consecutive calendar-year annual returns "
            "in column F, ending at the row year. Calculated locally, not a Trendlyne CAGR field. "
            "Current/incomplete years and windows with missing years are excluded. "
            "Rounded source returns and any partial first-year history limit precision.",
            "Data methodology",
        )
        annual_returns = {
            row[0].value: row[5].value
            for row in sheet.iter_rows(min_row=2, max_col=6)
            if isinstance(row[0].value, int)
            and row[0].value < date.today().year
            and isinstance(row[5].value, (int, float))
            and isfinite(row[5].value)
            and row[5].value >= -1
        }
        for row_number in range(2, sheet.max_row + 1):
            year = sheet.cell(row_number, 1).value
            cell = sheet.cell(row_number, 7)
            cell.value = None
            cell.fill = PatternFill()
            cell.number_format = "0.00%;[Red]-0.00%"
            if not isinstance(year, int) or year >= date.today().year:
                continue
            years = range(year - 4, year + 1)
            if not all(period in annual_returns for period in years):
                continue
            cell.value = prod(1 + annual_returns[period] for period in years) ** (1 / 5) - 1
            cell.fill = PatternFill("solid", fgColor="E2F0D9" if cell.value >= 0 else "FCE4D6")
            cell.comment = Comment(
                f"Calculated from annual returns for {year - 4}-{year}; not a forecast or "
                "a rolling five-year-to-today return. Verify the earliest source year is complete.",
                "Data methodology",
            )
        sheet.column_dimensions["G"].width = 25


def main():
    csv_rows = [["Index", "Year", "Q1", "Q2", "Q3", "Q4", "Annual Returns"]]
    for row in NIFTY50:
        csv_rows.append(["Nifty50", *row])
    pd.DataFrame(csv_rows[1:], columns=csv_rows[0]).to_csv(CSV_PATH, index=False)

    workbook = Workbook()
    workbook.remove(workbook.active)
    write_sheet(workbook, "Nifty50", NIFTY50, "Source: supplied Trendlyne screenshot; pattern column omitted.")
    for name in REQUESTED:
        if name in TRENDLYNE_IDS:
            try:
                rows = trendlyne_quarterly_returns(TRENDLYNE_IDS[name])
                note = f"Source: Trendlyne quarterly seasonality data, index ID {TRENDLYNE_IDS[name]}; pattern column omitted."
                if not rows:
                    note = f"No quarterly data returned by Trendlyne for index ID {TRENDLYNE_IDS[name]}."
            except Exception as error:
                rows = []
                note = f"Trendlyne data unavailable for index ID {TRENDLYNE_IDS[name]}: {error}"
        else:
            rows = []
            note = "No reliable public symbol mapping was found; no values were fabricated."
        write_sheet(workbook, name, rows, note)
    add_cagr(workbook)
    workbook.save(XLSX_PATH)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cagr-only", action="store_true", help="Add CAGR to the existing workbook without refreshing returns.")
    arguments = parser.parse_args()
    if arguments.cagr_only:
        workbook = load_workbook(XLSX_PATH)
        add_cagr(workbook)
        workbook.save(XLSX_PATH)
    else:
        main()