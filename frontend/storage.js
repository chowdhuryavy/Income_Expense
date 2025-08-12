export const state = {
  settings: {
    theme: 'dark',
    language: 'en',
    currencySymbol: '$',
    dateFormat: 'YYYY-MM-DD',
    numberFormat: '1,234.56',
    decimals: 2,
    autoSync: true,
    notifications: false,
    multiCurrency: false,
    baseCurrency: 'USD',
    categories: { income: ['Salary','Bonus','Interest'], expense: ['Food','Transport','Rent'] },
    accountTypes: ['Bank','Cash','Credit Card']
  },
  accounts: [],
  income: [],
  expense: [],
  transfer: [],
  lentBorrowed: [],
  exchangeRates: {}
};

export function setSettings(partial){
  state.settings = { ...state.settings, ...partial };
}

export function setAllData(payload){
  state.accounts = payload.accounts || [];
  state.income = payload.income || [];
  state.expense = payload.expense || [];
  state.transfer = payload.transfer || [];
  state.lentBorrowed = payload.lentBorrowed || [];
  state.settings = { ...state.settings, ...(payload.settings || {}) };
  state.exchangeRates = payload.exchangeRates || {};
}

export function totals(){
  const sum = arr => arr.reduce((a, b) => a + (Number(b.Amount || b.amount || 0)), 0);
  const income = sum(state.income);
  const expense = sum(state.expense);
  const balance = income - expense + state.accounts.reduce((a,acc) => a + Number(acc.Balance || 0), 0) - (sum(state.transfer.filter(()=>false))); // accounts already include balances
  const cash = state.accounts.filter(a => (a.Type||'').toLowerCase()==='cash').reduce((a,acc)=>a+Number(acc.Balance||0),0);
  const credit = state.accounts.filter(a => (a.Type||'').toLowerCase().includes('credit')).reduce((a,acc)=>a+Number(acc.Balance||0),0);
  return { income, expense, balance, cash, credit };
}

export function filterByDateRange(rows, range){
  const now = new Date();
  let start = new Date(now.getFullYear(), now.getMonth(), 1);
  let end = new Date(now.getFullYear(), now.getMonth()+1, 0);
  if (range === 'last_month'){
    start = new Date(now.getFullYear(), now.getMonth()-1, 1);
    end = new Date(now.getFullYear(), now.getMonth(), 0);
  } else if (range === 'this_year'){
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now.getFullYear(), 11, 31);
  }
  return rows.filter(r => {
    const d = new Date(r.Date || r.date || Date.now());
    return d >= start && d <= end;
  });
}