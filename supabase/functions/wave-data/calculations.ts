// Restricted arithmetic, never eval/Function. Missing inputs remain missing.
export const DEFINITIONS:any[] = [
 {key:'quick_ratio',title:'Quick Ratio',expression:'(cash + short_investments + receivables) / current_liabilities',variables:['cash','short_investments','receivables','current_assets','inventory','other_current_assets','current_liabilities'],basis:'Latest SEC balance sheet; strict liquid assets, excluding financing receivables',always:true},
 {key:'current_ratio',title:'Current Ratio',expression:'current_assets / current_liabilities',variables:['current_assets','current_liabilities'],basis:'Latest SEC balance sheet',always:true},
 {key:'pe_trailing',title:'P/E Trailing',expression:'price / eps_ttm',variables:['price','eps_ttm'],basis:'Current quote / provider TTM EPS; currencies must match',positive:['eps_ttm'],always:true},
 {key:'pe_forward',title:'P/E Forward',expression:'price / eps_forward',variables:['price','eps_forward'],basis:'Current quote / matched fiscal-year consensus EPS',positive:['eps_forward'],always:true},
 {key:'gross_margin',title:'Gross margin %',expression:'gross_profit / revenue * 100',variables:['gross_profit','revenue'],basis:'Latest SEC fiscal year; replaces provider TTM only after custom publication'},
 {key:'operating_margin',title:'Operating margin %',expression:'operating_income / revenue * 100',variables:['operating_income','revenue'],basis:'Latest SEC fiscal year; replaces provider TTM only after custom publication'},
 {key:'net_margin',title:'Net margin %',expression:'net_income / revenue * 100',variables:['net_income','revenue'],basis:'Latest SEC fiscal year; replaces provider TTM only after custom publication'},
 {key:'revenue_growth',title:'Revenue growth %',expression:'(revenue - revenue_previous) / abs(revenue_previous) * 100',variables:['revenue','revenue_previous'],basis:'Two consecutive SEC fiscal years'},
 {key:'earnings_growth',title:'Net income growth %',expression:'(net_income - net_income_previous) / abs(net_income_previous) * 100',variables:['net_income','net_income_previous'],basis:'Net income growth, not EPS growth; two consecutive SEC fiscal years'},
 {key:'roe',title:'ROE %',expression:'net_income / equity * 100',variables:['net_income','equity'],basis:'SEC fiscal-year income / same fiscal-year-end equity (not average equity)'},
 {key:'roa',title:'ROA %',expression:'net_income / assets * 100',variables:['net_income','assets'],basis:'SEC fiscal-year income / same fiscal-year-end assets (not average assets)'},
 {key:'ps_ratio',title:'Price / Sales',expression:'market_cap / revenue',variables:['market_cap','revenue'],basis:'Provider market cap / SEC fiscal-year revenue; same currency required',always:true},
 {key:'pb_ratio',title:'Price / Book',expression:'market_cap / equity_latest',variables:['market_cap','equity_latest'],basis:'Provider market cap / latest SEC equity; same currency required',positive:['equity_latest'],always:true},
 {key:'peg_historical',title:'PEG Historical — FY EPS YoY',expression:'(price / eps_ttm) / ((eps_annual / eps_previous - 1) * 100)',variables:['price','eps_ttm','eps_annual','eps_previous'],basis:'Separate historical PEG; not a substitute for provider forecast PEG',positive:['eps_ttm','eps_annual','eps_previous'],always:true},
];
export function evaluate(expression:string,values:Record<string,any>,allowed:string[]):number|null {
 if(typeof expression!=='string'||expression.length>500)throw Error('Formula too long');
 const parts=expression.match(/\s*(?:[A-Za-z_][A-Za-z_0-9]*|(?:\d+(?:\.\d*)?|\.\d+)|[()+*/,-])/g)||[];
 if(parts.join('').replace(/\s/g,'')!==expression.replace(/\s/g,''))throw Error('Only numbers, approved inputs, + - * / parentheses and abs() are allowed');
 const ts=parts.map(x=>x.trim());if(ts.length>160)throw Error('Formula too complex');let i=0,depth=0;
 const op=(a:number|null,b:number|null,k:string):number|null=>{if(a==null||b==null||(k==='/'&&b===0))return null;const n=k==='+'?a+b:k==='-'?a-b:k==='*'?a*b:a/b;return Number.isFinite(n)?n:null;};
 function atom():number|null{if(++depth>30)throw Error('Formula nesting limit');const t=ts[i++];let n:number|null;
 if(t==='('){n=sum();if(ts[i++]!==')')throw Error('Missing closing parenthesis');}
 else if(t==='-'||t==='+'){n=atom();if(t==='-'&&n!=null)n=-n;}
 else if(t==='abs'){if(ts[i++]!=='(')throw Error('abs needs parentheses');n=sum();if(ts[i++]!==')')throw Error('Missing closing parenthesis');if(n!=null)n=Math.abs(n);}
 else if(t&&/^\d|^\./.test(t)){n=Number(t);}
 else {if(!allowed.includes(t))throw Error('Unknown input: '+String(t));const v=values[t];n=typeof v==='number'&&Number.isFinite(v)?v:null;}
 depth--;return n;}
 function product():number|null{let n=atom();while(ts[i]==='*'||ts[i]==='/'){const k=ts[i++];n=op(n,atom(),k);}return n;}
 function sum():number|null{let n=product();while(ts[i]==='+'||ts[i]==='-'){const k=ts[i++];n=op(n,product(),k);}return n;}
 const result=sum();if(i!==ts.length)throw Error('Invalid formula');return result;
}
export function validateConfig(config:any){if(!config||typeof config!=='object'||Array.isArray(config))throw Error('Invalid settings');for(const [key,expr]of Object.entries(config)){const def=DEFINITIONS.find(d=>d.key===key);if(!def)throw Error('Unknown metric '+key);evaluate(expr as string,{},def.variables);}return config;}
export function runMetric(def:any,expression:string,inputs:any){if((def.positive||[]).some((k:string)=>!(inputs[k]>0)))return null;if(def.key==='peg_historical'&&!(inputs.eps_annual>inputs.eps_previous))return null;return evaluate(expression,inputs,def.variables);}

const MAP:any={cash:['CashAndCashEquivalentsAtCarryingValue'],short_investments:['ShortTermInvestments','MarketableSecuritiesCurrent'],receivables:['AccountsReceivableNetCurrent'],current_assets:['AssetsCurrent'],current_liabilities:['LiabilitiesCurrent'],inventory:['InventoryNet'],other_current_assets:['OtherAssetsCurrent'],equity:['StockholdersEquity'],assets:['Assets'],revenue:['RevenueFromContractWithCustomerExcludingAssessedTax','Revenues','SalesRevenueNet'],gross_profit:['GrossProfit'],operating_income:['OperatingIncomeLoss'],net_income:['NetIncomeLoss'],eps_annual:['EarningsPerShareDiluted']};
export function buildInputs(document:any,body:any){
 const facts=document?.facts?.['us-gaap']||{},trace:any={},inputs:any={};
 const rows=(key:string,annual=false)=>MAP[key].flatMap((tag:string,priority:number)=>(facts[tag]?.units?.[key==='eps_annual'?'USD/shares':'USD']||[]).filter((r:any)=>['10-K','10-K/A','10-Q','10-Q/A'].includes(r.form)&&typeof r.val==='number'&&Number.isFinite(r.val)&&(annual?(r.start&&(Date.parse(r.end)-Date.parse(r.start))/86400000>=330&&(Date.parse(r.end)-Date.parse(r.start))/86400000<=390):!r.start)).map((r:any)=>({...r,tag,priority}))).sort((a:any,b:any)=>String(b.end).localeCompare(a.end)||a.priority-b.priority||String(b.filed).localeCompare(a.filed));
 const latest=rows('current_liabilities')[0]?.end||rows('assets')[0]?.end||null;
 function read(key:string,end:string|null,annual=false){const r=rows(key,annual).find((x:any)=>x.end===end);return r?{value:r.val,period_end:r.end,period_start:r.start||null,unit:key==='eps_annual'?'USD/share':'USD',tag:r.tag,filed:r.filed,accession:r.accn}:null;}
 const annualRows=rows('revenue',true),fy=annualRows[0]?.end||null,prev=annualRows.find((r:any)=>r.end!==fy&&Math.abs((Date.parse(fy)-Date.parse(r.end))/86400000-365)<=35)?.end||null;
 for(const key of ['cash','short_investments','receivables','current_assets','current_liabilities','inventory','other_current_assets']){trace[key]=read(key,latest);inputs[key]=trace[key]?.value??null;}
 for(const key of ['revenue','gross_profit','operating_income','net_income','eps_annual']){trace[key]=read(key,fy,true);inputs[key]=trace[key]?.value??null;}
 for(const [key,source]of [['revenue_previous','revenue'],['net_income_previous','net_income'],['eps_previous','eps_annual']]){trace[key]=read(source,prev,true);inputs[key]=trace[key]?.value??null;}
 for(const key of ['assets','equity']){trace[key]=read(key,fy);inputs[key]=trace[key]?.value??null;}
 trace.equity_latest=read('equity',latest);inputs.equity_latest=trace.equity_latest?.value??null;
 for(const [key,source]of [['price','price'],['eps_ttm','eps_trailing'],['eps_forward','eps_forward'],['market_cap','market_cap']]){const v=body?.[source];inputs[key]=typeof v==='number'&&Number.isFinite(v)?v:null;trace[key]={value:inputs[key],source:'Company research quote/provider',timestamp:body?.price_timestamp||null};}
 // At a fiscal year end the reported annual EPS is the trailing twelve months.
 // Do not substitute stale annual EPS after an interim balance sheet exists.
 if(inputs.eps_ttm==null&&latest&&latest===fy&&body?.currency==='USD'){
  inputs.eps_ttm=inputs.eps_annual;trace.eps_ttm=trace.eps_annual;
 }
 // SEC inputs are USD. Never blend them with foreign-currency quotes.
 if(body?.currency!=='USD'){inputs.eps_annual=null;inputs.eps_previous=null;inputs.market_cap=null;}
 return {inputs,trace,balance_date:latest,fiscal_year:fy,previous_fiscal_year:prev};
}
