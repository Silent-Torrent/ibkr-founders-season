export const hotStockEdition = '2026Q4.v1'
export const hotStockMedalIds: readonly number[] = [14, 15, 16, 17, 20, 21]
export const hotTickers: Record<number, readonly (readonly string[])[]> = {
  2026: [
    ['GME', 'AMC'],
    ['SPCX'],
    ['NVDA', 'AMD', 'AVGO', 'TSM', 'MU', 'INTC'],
    ['KO', 'BRK.B', 'JNJ', 'PG'],
    ['AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'TSLA', 'NVDA'],
    ['BABA', 'PDD', 'JD', 'BIDU', 'NIO', 'LI', 'XPEV', 'BILI'],
  ],
}

export function hotStockGroup(year: number, medalId: number) {
  return hotTickers[year]?.[hotStockMedalIds.indexOf(medalId)]
}
