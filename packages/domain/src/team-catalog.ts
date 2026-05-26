import type { Team } from './types.js';

type TeamSeed = {
  name: string;
  abbreviation: string;
  conferenceId: string;
  primaryColor?: string;
  secondaryColor?: string;
  logoUrl?: string;
  logoAltUrl?: string;
};

const TEAM_SEEDS: TeamSeed[] = [
  { name: 'Boston College', abbreviation: 'BC', conferenceId: 'acc' },
  { name: 'Cal', abbreviation: 'CAL', conferenceId: 'acc' },
  { name: 'Clemson', abbreviation: 'CLEM', conferenceId: 'acc' },
  { name: 'Duke', abbreviation: 'DUKE', conferenceId: 'acc' },
  { name: 'Florida State', abbreviation: 'FSU', conferenceId: 'acc' },
  { name: 'Georgia Tech', abbreviation: 'GT', conferenceId: 'acc' },
  { name: 'Louisville', abbreviation: 'LOU', conferenceId: 'acc' },
  { name: 'Miami', abbreviation: 'MIA', conferenceId: 'acc' },
  { name: 'NC State', abbreviation: 'NCSU', conferenceId: 'acc' },
  { name: 'North Carolina', abbreviation: 'UNC', conferenceId: 'acc' },
  { name: 'Pitt', abbreviation: 'PITT', conferenceId: 'acc' },
  { name: 'SMU', abbreviation: 'SMU', conferenceId: 'acc' },
  { name: 'Stanford', abbreviation: 'STAN', conferenceId: 'acc' },
  { name: 'Syracuse', abbreviation: 'SYR', conferenceId: 'acc' },
  { name: 'Virginia', abbreviation: 'UVA', conferenceId: 'acc' },
  { name: 'Virginia Tech', abbreviation: 'VT', conferenceId: 'acc' },
  { name: 'Wake Forest', abbreviation: 'WAKE', conferenceId: 'acc' },

  { name: 'Illinois', abbreviation: 'ILL', conferenceId: 'big-ten' },
  { name: 'Indiana', abbreviation: 'IU', conferenceId: 'big-ten' },
  { name: 'Iowa', abbreviation: 'IOWA', conferenceId: 'big-ten' },
  { name: 'Maryland', abbreviation: 'MD', conferenceId: 'big-ten' },
  { name: 'Michigan', abbreviation: 'MICH', conferenceId: 'big-ten' },
  { name: 'Michigan State', abbreviation: 'MSU', conferenceId: 'big-ten' },
  { name: 'Minnesota', abbreviation: 'MINN', conferenceId: 'big-ten' },
  { name: 'Nebraska', abbreviation: 'NEB', conferenceId: 'big-ten' },
  { name: 'Northwestern', abbreviation: 'NU', conferenceId: 'big-ten' },
  {
    name: 'Ohio State',
    abbreviation: 'OSU',
    conferenceId: 'big-ten',
    primaryColor: '#BB0000',
    secondaryColor: '#666666',
  },
  { name: 'Oregon', abbreviation: 'ORE', conferenceId: 'big-ten' },
  { name: 'Penn State', abbreviation: 'PSU', conferenceId: 'big-ten' },
  { name: 'Purdue', abbreviation: 'PUR', conferenceId: 'big-ten' },
  { name: 'Rutgers', abbreviation: 'RUT', conferenceId: 'big-ten' },
  { name: 'UCLA', abbreviation: 'UCLA', conferenceId: 'big-ten' },
  { name: 'USC', abbreviation: 'USC', conferenceId: 'big-ten' },
  { name: 'Washington', abbreviation: 'WASH', conferenceId: 'big-ten' },
  { name: 'Wisconsin', abbreviation: 'WIS', conferenceId: 'big-ten' },

  { name: 'Arizona', abbreviation: 'ARIZ', conferenceId: 'big-12' },
  { name: 'Arizona State', abbreviation: 'ASU', conferenceId: 'big-12' },
  { name: 'Baylor', abbreviation: 'BAY', conferenceId: 'big-12' },
  { name: 'BYU', abbreviation: 'BYU', conferenceId: 'big-12' },
  { name: 'Cincinnati', abbreviation: 'CIN', conferenceId: 'big-12' },
  { name: 'Colorado', abbreviation: 'COLO', conferenceId: 'big-12' },
  { name: 'Houston', abbreviation: 'HOU', conferenceId: 'big-12' },
  { name: 'Iowa State', abbreviation: 'ISU', conferenceId: 'big-12' },
  { name: 'Kansas', abbreviation: 'KU', conferenceId: 'big-12' },
  { name: 'Kansas State', abbreviation: 'KSU', conferenceId: 'big-12' },
  { name: 'Oklahoma State', abbreviation: 'OKST', conferenceId: 'big-12' },
  { name: 'TCU', abbreviation: 'TCU', conferenceId: 'big-12' },
  { name: 'Texas Tech', abbreviation: 'TTU', conferenceId: 'big-12' },
  { name: 'UCF', abbreviation: 'UCF', conferenceId: 'big-12' },
  { name: 'Utah', abbreviation: 'UTAH', conferenceId: 'big-12' },
  { name: 'West Virginia', abbreviation: 'WVU', conferenceId: 'big-12' },

  {
    name: 'Alabama',
    abbreviation: 'ALA',
    conferenceId: 'sec',
    primaryColor: '#9E1B32',
    secondaryColor: '#FFFFFF',
  },
  { name: 'Arkansas', abbreviation: 'ARK', conferenceId: 'sec' },
  { name: 'Auburn', abbreviation: 'AUB', conferenceId: 'sec' },
  { name: 'Florida', abbreviation: 'FLA', conferenceId: 'sec' },
  {
    name: 'Georgia',
    abbreviation: 'UGA',
    conferenceId: 'sec',
    primaryColor: '#BA0C2F',
    secondaryColor: '#000000',
  },
  { name: 'Kentucky', abbreviation: 'UK', conferenceId: 'sec' },
  { name: 'LSU', abbreviation: 'LSU', conferenceId: 'sec' },
  { name: 'Mississippi State', abbreviation: 'MSST', conferenceId: 'sec' },
  { name: 'Missouri', abbreviation: 'MIZ', conferenceId: 'sec' },
  { name: 'Oklahoma', abbreviation: 'OU', conferenceId: 'sec' },
  { name: 'Ole Miss', abbreviation: 'MISS', conferenceId: 'sec' },
  { name: 'South Carolina', abbreviation: 'SCAR', conferenceId: 'sec' },
  { name: 'Tennessee', abbreviation: 'TENN', conferenceId: 'sec' },
  { name: 'Texas', abbreviation: 'TEX', conferenceId: 'sec' },
  { name: 'Texas A&M', abbreviation: 'TAMU', conferenceId: 'sec' },
  { name: 'Vanderbilt', abbreviation: 'VAN', conferenceId: 'sec' },

  { name: 'Army', abbreviation: 'ARMY', conferenceId: 'aac' },
  { name: 'Charlotte', abbreviation: 'CLT', conferenceId: 'aac' },
  { name: 'East Carolina', abbreviation: 'ECU', conferenceId: 'aac' },
  { name: 'FAU', abbreviation: 'FAU', conferenceId: 'aac' },
  { name: 'Memphis', abbreviation: 'MEM', conferenceId: 'aac' },
  { name: 'Navy', abbreviation: 'NAVY', conferenceId: 'aac' },
  { name: 'North Texas', abbreviation: 'UNT', conferenceId: 'aac' },
  { name: 'Rice', abbreviation: 'RICE', conferenceId: 'aac' },
  { name: 'South Florida', abbreviation: 'USF', conferenceId: 'aac' },
  { name: 'Temple', abbreviation: 'TEM', conferenceId: 'aac' },
  { name: 'Tulane', abbreviation: 'TULN', conferenceId: 'aac' },
  { name: 'Tulsa', abbreviation: 'TLSA', conferenceId: 'aac' },
  { name: 'UAB', abbreviation: 'UAB', conferenceId: 'aac' },
  { name: 'UTSA', abbreviation: 'UTSA', conferenceId: 'aac' },

  { name: 'Delaware', abbreviation: 'DEL', conferenceId: 'c-usa' },
  { name: 'FIU', abbreviation: 'FIU', conferenceId: 'c-usa' },
  { name: 'Jacksonville State', abbreviation: 'JVST', conferenceId: 'c-usa' },
  { name: 'Kennesaw State', abbreviation: 'KENN', conferenceId: 'c-usa' },
  { name: 'Liberty', abbreviation: 'LIB', conferenceId: 'c-usa' },
  { name: 'Louisiana Tech', abbreviation: 'LT', conferenceId: 'c-usa' },
  { name: 'Middle Tennessee', abbreviation: 'MTSU', conferenceId: 'c-usa' },
  { name: 'Missouri State', abbreviation: 'MOST', conferenceId: 'c-usa' },
  { name: 'New Mexico State', abbreviation: 'NMSU', conferenceId: 'c-usa' },
  { name: 'Sam Houston', abbreviation: 'SHSU', conferenceId: 'c-usa' },
  { name: 'UTEP', abbreviation: 'UTEP', conferenceId: 'c-usa' },
  { name: 'Western Kentucky', abbreviation: 'WKU', conferenceId: 'c-usa' },

  { name: 'Akron', abbreviation: 'AKR', conferenceId: 'mac' },
  { name: 'Ball State', abbreviation: 'BALL', conferenceId: 'mac' },
  { name: 'Bowling Green', abbreviation: 'BGSU', conferenceId: 'mac' },
  { name: 'Buffalo', abbreviation: 'BUFF', conferenceId: 'mac' },
  { name: 'Central Michigan', abbreviation: 'CMU', conferenceId: 'mac' },
  { name: 'Eastern Michigan', abbreviation: 'EMU', conferenceId: 'mac' },
  { name: 'Kent State', abbreviation: 'KENT', conferenceId: 'mac' },
  { name: 'Miami (OH)', abbreviation: 'M-OH', conferenceId: 'mac' },
  { name: 'Northern Illinois', abbreviation: 'NIU', conferenceId: 'mac' },
  { name: 'Ohio', abbreviation: 'OHIO', conferenceId: 'mac' },
  { name: 'Toledo', abbreviation: 'TOL', conferenceId: 'mac' },
  { name: 'UMass', abbreviation: 'UMASS', conferenceId: 'mac' },
  { name: 'Western Michigan', abbreviation: 'WMU', conferenceId: 'mac' },

  { name: 'Air Force', abbreviation: 'AFA', conferenceId: 'mwc' },
  { name: 'Boise State', abbreviation: 'BSU', conferenceId: 'mwc' },
  { name: 'Colorado State', abbreviation: 'CSU', conferenceId: 'mwc' },
  { name: 'Fresno State', abbreviation: 'FRES', conferenceId: 'mwc' },
  { name: 'Hawaii', abbreviation: 'HAW', conferenceId: 'mwc' },
  { name: 'Nevada', abbreviation: 'NEV', conferenceId: 'mwc' },
  { name: 'New Mexico', abbreviation: 'UNM', conferenceId: 'mwc' },
  { name: 'San Diego State', abbreviation: 'SDSU', conferenceId: 'mwc' },
  { name: 'San Jose State', abbreviation: 'SJSU', conferenceId: 'mwc' },
  { name: 'UNLV', abbreviation: 'UNLV', conferenceId: 'mwc' },
  { name: 'Utah State', abbreviation: 'USU', conferenceId: 'mwc' },
  { name: 'Wyoming', abbreviation: 'WYO', conferenceId: 'mwc' },

  { name: 'App State', abbreviation: 'APP', conferenceId: 'sun-belt' },
  { name: 'Arkansas State', abbreviation: 'ARST', conferenceId: 'sun-belt' },
  { name: 'Coastal Carolina', abbreviation: 'CCU', conferenceId: 'sun-belt' },
  { name: 'Georgia Southern', abbreviation: 'GASO', conferenceId: 'sun-belt' },
  { name: 'Georgia State', abbreviation: 'GAST', conferenceId: 'sun-belt' },
  { name: 'James Madison', abbreviation: 'JMU', conferenceId: 'sun-belt' },
  { name: 'Louisiana', abbreviation: 'UL', conferenceId: 'sun-belt' },
  { name: 'Marshall', abbreviation: 'MRSH', conferenceId: 'sun-belt' },
  { name: 'Old Dominion', abbreviation: 'ODU', conferenceId: 'sun-belt' },
  { name: 'South Alabama', abbreviation: 'USA', conferenceId: 'sun-belt' },
  { name: 'Southern Miss', abbreviation: 'USM', conferenceId: 'sun-belt' },
  { name: 'Texas State', abbreviation: 'TXST', conferenceId: 'sun-belt' },
  { name: 'Troy', abbreviation: 'TROY', conferenceId: 'sun-belt' },
  { name: 'ULM', abbreviation: 'ULM', conferenceId: 'sun-belt' },

  { name: 'Notre Dame', abbreviation: 'ND', conferenceId: 'independent' },
  { name: 'Oregon State', abbreviation: 'ORST', conferenceId: 'pac-12' },
  { name: 'UConn', abbreviation: 'CONN', conferenceId: 'independent' },
  { name: 'Washington State', abbreviation: 'WSU', conferenceId: 'pac-12' },
  { name: 'Sacramento State', abbreviation: 'SAC', conferenceId: 'future' },
  { name: 'Tarleton State', abbreviation: 'TAR', conferenceId: 'future' },
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('&', 'and')
    .replaceAll('(', '')
    .replaceAll(')', '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export const NCAA_TEAM_CATALOG: Team[] = TEAM_SEEDS.map((seed) => {
  const id = `team-${slugify(seed.name)}`;
  return {
    id,
    name: seed.name,
    abbreviation: seed.abbreviation,
    conferenceId: seed.conferenceId,
    primaryColor: seed.primaryColor ?? '#1d4ed8',
    secondaryColor: seed.secondaryColor ?? '#f8fafc',
    logoUrl: seed.logoUrl ?? `/teams/${id}.png`,
    logoAltUrl: seed.logoAltUrl,
  };
});

export const NCAA_TEAM_COUNT = NCAA_TEAM_CATALOG.length;
