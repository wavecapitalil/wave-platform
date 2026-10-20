// BEA official series distributed by FRED. Latest revised observations only.
// Food/energy PCE lines overlap the product groups and are never added to them.
export const COMPONENTS = {
  gdp: {
    kind:'contributions', table:'BEA NIPA 1.1.2', unit:'percentage points · annual rate',
    headline:'A191RL1Q225SBEA', frequency:'quarterly',
    detail:'Published signed contributions; imports already carry their contribution sign. The five disjoint expenditure groups are summed once. Headline minus sum is checked against a 0.075 pp rounding bound (five two-decimal components and one one-decimal headline). Same-period latest revised observations fetched together; not an immutable release vintage.',
    series:[
      ['DPCERY2Q224SBEA','Personal consumption','צריכה פרטית'],
      ['A006RY2Q224SBEA','Gross private domestic investment','השקעה פרטית מקומית'],
      ['A020RY2Q224SBEA','Exports','יצוא'],
      ['A021RY2Q224SBEA','Imports · signed contribution','יבוא · תרומה חתומה'],
      ['A822RY2Q224SBEA','Government consumption and investment','צריכה והשקעה ממשלתית']
    ]
  },
  pce: {
    kind:'price_rates', table:'BEA NIPA 2.8.4', unit:'% change · SA',
    headline:'PCEPI', frequency:'monthly',
    detail:'Chain-type price indices, 2017=100, seasonally adjusted. MoM = 100 × (index / same series previous month − 1); YoY = 100 × (index / same series 12 months earlier − 1). Missing reference months remain null. Durable goods, nondurable goods and services are product groups; food and energy are overlapping supplementary categories. These growth rates are not additive inflation contributions. No expenditure weights or real-spending Table 2.3.2 rates are used.',
    series:[
      ['DDURRG3M086SBEA','Durable goods','מוצרים בני קיימא'],
      ['DNDGRG3M086SBEA','Nondurable goods','מוצרים שאינם בני קיימא'],
      ['DSERRG3M086SBEA','Services','שירותים'],
      ['DFXARG3M086SBEA','Food · supplementary','מזון · קטגוריה משלימה'],
      ['DNRGRG3M086SBEA','Energy · supplementary','אנרגיה · קטגוריה משלימה']
    ]
  }
};
