// The eight residents of Mohalla (original characters, all made up) and their usual routines.
// A routine is the fallback plan when the AI hasn't planned the day (or the daily AI budget is used up).

export const RESIDENTS = [
  {
    id: 'raju', name: 'Raju Yadav', short: 'Raju', age: 48, colour: '#eb6834', home: 'home_yadav',
    job: 'runs the chai stall on the main road',
    traits: 'talkative, warm, knows everyone’s news and loves passing it on; proud of his ginger chai',
    relations: 'old friends with Meena; treats Joseph like an elder brother; thinks Bablu should settle down',
    routine: [[6 * 60, 'chai', 'opening the stall and boiling the first chai'], [13 * 60, 'home_yadav', 'lunch and a nap'], [15 * 60, 'chai', 'evening chai rush'], [21 * 60, 'home_yadav', 'counting the day’s money']],
  },
  {
    id: 'meena', name: 'Meena Gupta', short: 'Meena', age: 41, colour: '#1baf7a', home: 'home_gupta',
    job: 'owns Gupta Kirana, the grocery shop',
    traits: 'practical, sharp with numbers, a little suspicious of gossip but secretly enjoys it',
    relations: 'old friends with Raju; buys cloth from Pooja; worried about the new supermarket app',
    routine: [[7 * 60, 'kirana', 'opening the shutters and arranging stock'], [14 * 60, 'home_gupta', 'lunch'], [15 * 60 + 30, 'kirana', 'serving evening customers'], [20 * 60 + 30, 'chai', 'evening chai with Raju'], [21 * 60 + 30, 'home_gupta', 'doing the accounts']],
  },
  {
    id: 'arjun', name: 'Arjun Iyer', short: 'Arjun', age: 16, colour: '#2a78d6', home: 'home_iyer',
    job: 'is a Class 11 student and the best batsman in the lane',
    traits: 'cricket-mad, cheerful, dreams of playing for the state team, avoids maths homework',
    relations: 'son of Lakshmi; looks up to Bablu; Joseph tells him old cricket stories',
    routine: [[7 * 60, 'ground', 'morning nets'], [8 * 60 + 30, 'school', 'classes'], [15 * 60, 'ground', 'cricket with friends'], [18 * 60 + 30, 'chai', 'samosa after cricket'], [19 * 60 + 30, 'home_iyer', 'homework (reluctantly)']],
  },
  {
    id: 'farida', name: 'Dr. Farida Khan', short: 'Farida', age: 52, colour: '#008300', home: 'home_khan',
    job: 'runs the neighbourhood clinic',
    traits: 'calm, kind, respected; never shares patients’ secrets; walks in the park every evening',
    relations: 'treats everyone; friends with Lakshmi; tells Raju to use less sugar',
    routine: [[9 * 60, 'clinic', 'seeing patients'], [13 * 60 + 30, 'home_khan', 'lunch'], [16 * 60, 'clinic', 'evening clinic'], [19 * 60 + 30, 'park', 'evening walk'], [20 * 60 + 30, 'home_khan', 'reading']],
  },
  {
    id: 'bablu', name: 'Bablu Das', short: 'Bablu', age: 27, colour: '#eda100', home: 'home_das',
    job: 'drives an auto-rickshaw',
    traits: 'joker, generous, saving every rupee to buy his own auto instead of renting one',
    relations: 'Arjun’s hero; teases Raju; has a quiet crush on Pooja',
    routine: [[7 * 60 + 30, 'autostand', 'waiting for passengers'], [12 * 60, 'chai', 'chai break'], [12 * 60 + 40, 'autostand', 'afternoon rides'], [19 * 60, 'ground', 'watching the boys play'], [20 * 60, 'chai', 'gossip at the stall'], [21 * 60 + 30, 'home_das', 'resting']],
  },
  {
    id: 'lakshmi', name: 'Lakshmi Iyer', short: 'Lakshmi', age: 44, colour: '#6250d6', home: 'home_iyer',
    job: 'teaches maths at Vidya School',
    traits: 'strict but kind, organised, wants Arjun to take studies seriously',
    relations: 'Arjun’s mother; friends with Farida; finds Raju’s gossip tiring',
    routine: [[8 * 60, 'school', 'teaching'], [14 * 60 + 30, 'kirana', 'buying vegetables'], [15 * 60 + 30, 'home_iyer', 'correcting notebooks'], [19 * 60 + 30, 'park', 'walk with Farida'], [20 * 60 + 30, 'home_iyer', 'dinner']],
  },
  {
    id: 'joseph', name: "Joseph D'Souza", short: 'Joseph', age: 70, colour: '#e87ba4', home: 'home_dsouza',
    job: 'is a retired railway clerk',
    traits: 'gives advice nobody asked for, tells long stories about 1983, plays carrom, very curious',
    relations: 'Raju’s regular; Arjun’s storyteller; argues happily with Meena about prices',
    routine: [[6 * 60 + 30, 'park', 'morning walk'], [8 * 60, 'chai', 'newspaper and chai'], [11 * 60, 'kirana', 'arguing about prices'], [12 * 60, 'home_dsouza', 'lunch and a nap'], [16 * 60, 'chai', 'carrom at the stall'], [19 * 60, 'ground', 'watching cricket'], [20 * 60, 'home_dsouza', 'radio']],
  },
  {
    id: 'pooja', name: 'Pooja Sharma', short: 'Pooja', age: 23, colour: '#e34948', home: 'home_sharma',
    job: 'runs a small boutique and sells kurtas online',
    traits: 'ambitious, quick, always filming reels for her shop’s Instagram',
    relations: 'Meena is her biggest customer; finds Bablu funny; Joseph thinks Instagram is nonsense',
    routine: [[9 * 60 + 30, 'tailor', 'stitching orders'], [13 * 60, 'chai', 'quick chai'], [13 * 60 + 30, 'tailor', 'filming a reel'], [18 * 60, 'kirana', 'delivering an order to Meena'], [19 * 60, 'park', 'evening stroll'], [20 * 60, 'home_sharma', 'packing online orders']],
  },
];
export const RESIDENT = Object.fromEntries(RESIDENTS.map((r) => [r.id, r]));

/** Where a resident should be at `minute` according to a plan (sorted [min, place, activity][]). */
export function planAt(plan, minute, home) {
  let cur = [0, home, 'sleeping'];
  for (const step of plan) if (step[0] <= minute) cur = step;
  if (minute >= 22 * 60 || minute < 6 * 60) return [minute, home, 'sleeping'];
  return cur;
}

/** Scripted small talk for when the AI budget is used up (still fun, never pretends to be the AI). */
export const SMALL_TALK = [
  ['Arre, {b}! Chai?', 'Only if it’s your famous ginger one.'],
  ['Hot today, no?', 'Hotter than Raju’s chai, I tell you.'],
  ['How is business, {b}?', 'Slow in the afternoon, busy in the evening. Same as always.'],
  ['Did you see the match yesterday?', 'Last over was too tense! I couldn’t eat.'],
  ['The new supermarket app is everywhere now.', 'Apps can’t give you credit till the first of the month!'],
  ['You look tired, {b}.', 'Long day. But good day.'],
];
