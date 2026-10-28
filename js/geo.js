// Géographie du cinéma : continent et drapeau d'un pays à partir de son nom français (TMDB ou Wikidata).
import { fold } from './util.js';

const CONTINENTS = {
  Europe: 'AL AD AT BY BE BA BG HR CY CZ DK EE FI FR DE GR HU IS IE IT XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB VA GI FO AX JE GG IM',
  Asie: 'AF AM AZ BH BD BT BN KH CN GE IN ID IR IQ IL JP JO KZ KW KG LA LB MY MV MN MM NP KP OM PK PS PH QA SA SG KR LK SY TW TJ TH TL TR TM AE UZ VN YE HK MO',
  Afrique: 'DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW RE',
  'Amérique du Nord': 'US CA MX GT BZ SV HN NI CR PA CU JM HT DO BS BB TT PR GL AG DM GD KN LC VC BM AW CW KY',
  'Amérique du Sud': 'AR BO BR CL CO EC GY PY PE SR UY VE',
  Océanie: 'AU NZ FJ PG SB VU WS TO KI FM MH NR PW TV NC PF',
};
export const CONTINENT_NAMES = Object.keys(CONTINENTS);
const byCode = new Map();
for (const [name, codes] of Object.entries(CONTINENTS)) for (const c of codes.split(' ')) byCode.set(c, name);

// Noms usuels qui diffèrent de ceux de la norme CLDR, et anciens États.
const ALIASES = {
  'hong kong': 'HK', 'republique populaire de chine': 'CN', 'etats-unis d\'amerique': 'US', 'republique tcheque': 'CZ', 'birmanie': 'MM', 'myanmar': 'MM', 'coree': 'KR', 'republique de coree': 'KR',
  'macedoine': 'MK', 'turquie': 'TR', 'turkiye': 'TR', 'cote d\'ivoire': 'CI', 'russie': 'RU', 'federation de russie': 'RU', 'ex-republique yougoslave de macedoine': 'MK', 'palestine': 'PS',
  'vietnam': 'VN', 'viet nam': 'VN', 'royaume uni': 'GB', 'republique de chine': 'TW', 'iran (republique islamique d\')': 'IR', 'republique democratique du congo': 'CD',
};
const HISTORIC = { 'union sovietique': 'Europe', 'allemagne de l\'ouest': 'Europe', 'allemagne de l\'est': 'Europe', 'tchecoslovaquie': 'Europe', 'yougoslavie': 'Europe', 'serbie-et-montenegro': 'Europe', 'republique democratique allemande': 'Europe', 'republique federale d\'allemagne': 'Europe', 'republique federale de yougoslavie': 'Europe' };

let nameToCode = null;
function table() {
  if (nameToCode) return nameToCode;
  nameToCode = new Map();
  if (typeof Intl !== 'undefined' && Intl.DisplayNames) {
    const dn = new Intl.DisplayNames(['fr'], { type: 'region' });
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        try {
          const n = dn.of(code);
          if (n && n !== code && byCode.has(code)) nameToCode.set(fold(n), code);
        } catch {}
      }
    }
  }
  for (const [k, v] of Object.entries(ALIASES)) nameToCode.set(k, v);
  return nameToCode;
}

export const codeOf = (country) => table().get(fold(country)) || null;
export const continentOf = (country) => {
  const f = fold(country);
  if (HISTORIC[f]) return HISTORIC[f];
  const c = codeOf(country);
  return (c && byCode.get(c)) || null;
};
export const flag = (country) => {
  const c = codeOf(country);
  return c && !['XK'].includes(c) ? String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)) : '🏳️';
};
