// The closed list of indicators a check may use (rule 6). Seed with
// `pnpm db:seed-catalog`. Keys are permanent: to change what an item measures,
// add a new key and deactivate the old one.

import type { CatalogFrequency, CatalogSource, CatalogTransform } from "@/db/enums";

const REVENUE = "RevenueFromContractWithCustomerExcludingAssessedTax|Revenues|SalesRevenueNet";

export interface CatalogDefinition {
  key: string;
  label: string;
  source: CatalogSource;
  sourceCode: string;
  denominatorCode: string | null;
  unit: string;
  transform: CatalogTransform;
  frequency: CatalogFrequency;
  description: string;
}

type Item = CatalogDefinition;

const xbrl = (
  key: string,
  label: string,
  sourceCode: string,
  transform: Item["transform"],
  frequency: Item["frequency"],
  unit: string,
  description: string,
  denominatorCode?: string,
): Item => ({
  key,
  label,
  source: "xbrl",
  sourceCode,
  denominatorCode: denominatorCode ?? null,
  transform,
  frequency,
  unit,
  description,
});

const fred = (
  key: string,
  label: string,
  series: string,
  transform: Item["transform"],
  frequency: Item["frequency"],
  unit: string,
): Item => ({
  key,
  label,
  source: "fred",
  sourceCode: series,
  denominatorCode: null,
  transform,
  frequency,
  unit,
  description: `FRED series ${series}${transform === "yoy_pct" ? ", change vs one year earlier" : ""}.`,
});

export const INDICATOR_CATALOG: Item[] = [
  // Income statement, quarterly (10-Q and 10-K three-month periods)
  xbrl("revenue_q", "Revenue, quarterly", REVENUE, "level", "quarterly", "USD", "Latest three-month revenue."),
  xbrl("revenue_yoy_pct_q", "Revenue growth, quarter vs same quarter last year", REVENUE, "yoy_pct", "quarterly", "%", "Latest quarter revenue vs the quarter ending about one year earlier."),
  xbrl("revenue_yoy_pct_fy", "Revenue growth, fiscal year", REVENUE, "yoy_pct", "annual", "%", "Latest fiscal-year revenue vs the prior fiscal year."),
  xbrl("gross_profit_yoy_pct_q", "Gross profit growth, quarterly y/y", "GrossProfit", "yoy_pct", "quarterly", "%", "Latest quarter gross profit vs a year earlier."),
  xbrl("gross_margin_pct_q", "Gross margin, quarterly", "GrossProfit", "ratio_pct", "quarterly", "%", "Gross profit / revenue for the latest quarter.", REVENUE),
  xbrl("operating_income_q", "Operating income, quarterly", "OperatingIncomeLoss", "level", "quarterly", "USD", "Latest three-month operating income."),
  xbrl("operating_income_yoy_pct_q", "Operating income growth, quarterly y/y", "OperatingIncomeLoss", "yoy_pct", "quarterly", "%", "Latest quarter operating income vs a year earlier."),
  xbrl("operating_margin_pct_q", "Operating margin, quarterly", "OperatingIncomeLoss", "ratio_pct", "quarterly", "%", "Operating income / revenue for the latest quarter.", REVENUE),
  xbrl("net_income_q", "Net income, quarterly", "NetIncomeLoss", "level", "quarterly", "USD", "Latest three-month net income."),
  xbrl("net_margin_pct_q", "Net margin, quarterly", "NetIncomeLoss", "ratio_pct", "quarterly", "%", "Net income / revenue for the latest quarter.", REVENUE),
  xbrl("eps_diluted_q", "Diluted EPS, quarterly", "EarningsPerShareDiluted", "level", "quarterly", "USD/share", "Latest three-month diluted EPS."),
  xbrl("eps_diluted_yoy_pct_q", "Diluted EPS growth, quarterly y/y", "EarningsPerShareDiluted", "yoy_pct", "quarterly", "%", "Latest quarter diluted EPS vs a year earlier."),
  xbrl("eps_diluted_fy", "Diluted EPS, fiscal year", "EarningsPerShareDiluted", "level", "annual", "USD/share", "Latest fiscal-year diluted EPS."),
  xbrl("rd_expense_yoy_pct_q", "R&D expense growth, quarterly y/y", "ResearchAndDevelopmentExpense", "yoy_pct", "quarterly", "%", "Latest quarter R&D expense vs a year earlier."),
  xbrl("sga_expense_yoy_pct_q", "SG&A expense growth, quarterly y/y", "SellingGeneralAndAdministrativeExpense", "yoy_pct", "quarterly", "%", "Latest quarter SG&A vs a year earlier."),
  // Cash flow (annual: 10-Q cash flows are year-to-date, not quarterly)
  xbrl("operating_cash_flow_fy", "Operating cash flow, fiscal year", "NetCashProvidedByUsedInOperatingActivities", "level", "annual", "USD", "Latest fiscal-year cash from operations."),
  xbrl("capex_fy", "Capital expenditure, fiscal year", "PaymentsToAcquirePropertyPlantAndEquipment", "level", "annual", "USD", "Latest fiscal-year purchases of property, plant and equipment."),
  xbrl("capex_yoy_pct_fy", "Capex growth, fiscal year", "PaymentsToAcquirePropertyPlantAndEquipment", "yoy_pct", "annual", "%", "Fiscal-year capex vs the prior year."),
  // Balance sheet (point in time)
  xbrl("cash_and_equivalents", "Cash and cash equivalents", "CashAndCashEquivalentsAtCarryingValue", "level", "instant", "USD", "Latest reported balance."),
  xbrl("long_term_debt", "Long-term debt, non-current", "LongTermDebtNoncurrent|LongTermDebt", "level", "instant", "USD", "Latest reported balance."),
  xbrl("inventory", "Inventory", "InventoryNet", "level", "instant", "USD", "Latest reported balance."),
  xbrl("inventory_yoy_pct", "Inventory growth, y/y", "InventoryNet", "yoy_pct", "instant", "%", "Latest inventory vs the balance about one year earlier."),
  xbrl("stockholders_equity", "Stockholders' equity", "StockholdersEquity", "level", "instant", "USD", "Latest reported balance."),
  // Macro (FRED)
  fred("fed_funds_rate", "Effective federal funds rate", "FEDFUNDS", "level", "monthly", "%"),
  fred("cpi_yoy_pct", "CPI inflation, y/y", "CPIAUCSL", "yoy_pct", "monthly", "%"),
  fred("core_cpi_yoy_pct", "Core CPI inflation, y/y", "CPILFESL", "yoy_pct", "monthly", "%"),
  fred("unemployment_rate", "Unemployment rate", "UNRATE", "level", "monthly", "%"),
  fred("treasury_10y_yield", "10-year Treasury yield", "DGS10", "level", "daily", "%"),
  fred("treasury_2y_yield", "2-year Treasury yield", "DGS2", "level", "daily", "%"),
  fred("yield_curve_10y_2y", "10-year minus 2-year Treasury spread", "T10Y2Y", "level", "daily", "pct pts"),
  fred("real_gdp_yoy_pct", "Real GDP growth, y/y", "GDPC1", "yoy_pct", "quarterly", "%"),
  fred("industrial_production_yoy_pct", "Industrial production, y/y", "INDPRO", "yoy_pct", "monthly", "%"),
  fred("payrolls_yoy_pct", "Nonfarm payrolls, y/y", "PAYEMS", "yoy_pct", "monthly", "%"),
  fred("wti_crude_usd", "WTI crude oil price", "DCOILWTICO", "level", "daily", "USD/bbl"),
  // Prices (Tiingo, adjusted close)
  {
    key: "return_from_entry_pct",
    label: "Total return since position entry",
    source: "price",
    sourceCode: "adjClose",
    denominatorCode: null,
    transform: "return_from_entry_pct",
    frequency: "daily",
    unit: "%",
    description: "Adjusted close now vs adjusted close on the position's entry date.",
  },
  {
    key: "drawdown_from_high_pct",
    label: "Drawdown from high since entry",
    source: "price",
    sourceCode: "adjClose",
    denominatorCode: null,
    transform: "drawdown_from_high_pct",
    frequency: "daily",
    unit: "%",
    description: "Adjusted close now vs the highest adjusted close since entry (0 or negative).",
  },
];
