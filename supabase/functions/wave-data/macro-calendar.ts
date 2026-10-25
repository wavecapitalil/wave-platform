// Bounded official schedule, verified 2026-10-25. Never extrapolate missing dates.
// UTC instants preserve US daylight-saving transitions; display America/New_York.
const verified_at='2026-10-25T09:52:00Z';
const bls='https://www.bls.gov/schedule/2026/home.htm';
const bea='https://www.bea.gov/news/schedule';
export const MACRO_CALENDAR = [
  {series:'pce',period:'2026-08-01',scheduled_at:'2026-09-30T12:30:00Z',source:'https://www.bea.gov/news/2026/personal-income-and-outlays-july-2026'},
  {series:'pce',period:'2026-09-01',scheduled_at:'2026-10-29T12:30:00Z',source:'https://www.bea.gov/news/2026/personal-income-and-outlays-august-2026'},
  {series:'pce',period:'2026-10-01',scheduled_at:'2026-11-25T13:30:00Z',source:bea},
  {series:'jolts',period:'2026-08-01',scheduled_at:'2026-09-29T14:00:00Z',source:'https://www.bls.gov/news.release/archives/jolts_09012026.htm'},
  {series:'jolts',period:'2026-09-01',scheduled_at:'2026-11-03T15:00:00Z',source:'https://www.bls.gov/news.release/archives/jolts_09292026.htm'},
  ...['cpi','core_cpi'].map(series=>({series,period:'2026-10-01',scheduled_at:'2026-11-10T13:30:00Z',source:bls})),
  ...['nfp','unemployment','wages'].map(series=>({series,period:'2026-10-01',scheduled_at:'2026-11-06T13:30:00Z',source:bls})),
  {series:'gdp',period:'2026-07-01',scheduled_at:'2026-10-29T12:30:00Z',source:bea},
].map(r=>({...r,id:r.series+':scheduled:'+r.scheduled_at,verified_at,time_zone:'America/New_York',consensus:null}));

export function releaseCalendar(id:string,now=Date.now()){
  return MACRO_CALENDAR.filter(r=>r.series===id&&Date.parse(r.verified_at)<=now).sort((a,b)=>a.scheduled_at.localeCompare(b.scheduled_at));
}
export function calendarFreshness(id:string,period:string|null,now=Date.now(),events=releaseCalendar(id,now)){
  const due=events.filter(r=>Date.parse(r.scheduled_at)<=now&&(!period||r.period>period)).at(-1)||null;
  const next=events.find(r=>Date.parse(r.scheduled_at)>now)||null;
  return {freshness:due?'release_overdue':next?'latest_available':'schedule_unavailable',next_release:next,overdue_release:due,schedule_basis:'verified_official_calendar'};
}
