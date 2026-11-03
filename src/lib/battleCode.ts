import {sha256Hex} from './sha256'
import {validSelection} from './medalCollection'
import type {DivisionKey} from './season'
const tiers:DivisionKey[]=['rookieLeague','retailLeague','sixFigureLeague','capitalLeague','whaleLeague']
export interface Battle { percent:number; division:DivisionKey; medals:number[] }
export function encodeBattle(input:Battle) {
  const {percent,division,medals}=input
  const bp=Math.round(percent*100)
  if(!Number.isSafeInteger(bp) || !tiers.includes(division) || !Array.isArray(medals) ||
    validSelection(medals).length!==medals.length)throw new Error('Invalid fields')
  const payload=['PL1',bp,tiers.indexOf(division),medals.join(',')].join('~')
  return payload+'~'+sha256Hex(payload).slice(0,12)
}
export function decodeBattle(code:string):Battle {
  if(code.length>100 || !/^PL1~-?(?:0|[1-9]\d*)~[0-4]~(?:\d{1,2}(?:,\d{1,2}){0,2})?~[a-f0-9]{12}$/.test(code))throw new Error('Invalid code')
  const [,bp,tier,ids]=code.split('~')
  const result={percent:Number(bp)/100,division:tiers[Number(tier)],medals:ids?ids.split(',').map(Number):[]}
  if(encodeBattle(result)!==code)throw new Error('Invalid checksum')
  return result
}
export function rankRows(rows:{label:string;value:number}[],ascending=false){
  const sorted=[...rows].filter(r=>Number.isFinite(r.value)).sort((a,b)=>(ascending?1:-1)*(a.value-b.value)||a.label.localeCompare(b.label))
  let rank=0
  return sorted.map((row,i)=>{if(!i||row.value!==sorted[i-1].value)rank=i+1;return {...row,rank}})
}
