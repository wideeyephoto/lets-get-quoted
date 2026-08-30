/**
 * Curated US city dataset and fuzzy autocomplete matcher.
 * Provides instant keystroke responses for target city fields in marketing/ads,
 * with flexible matching that handles missing spaces (e.g. "royaloak" -> "Royal Oak, MI").
 */

export type CitySuggestion = {
  city: string;
  state: string;
  label: string;
};

export const COMMON_US_CITIES: CitySuggestion[] = [
  // Top Metro & Trade Hubs
  { city: 'Royal Oak', state: 'MI', label: 'Royal Oak, MI' },
  { city: 'Detroit', state: 'MI', label: 'Detroit, MI' },
  { city: 'Troy', state: 'MI', label: 'Troy, MI' },
  { city: 'Birmingham', state: 'MI', label: 'Birmingham, MI' },
  { city: 'Ferndale', state: 'MI', label: 'Ferndale, MI' },
  { city: 'Berkley', state: 'MI', label: 'Berkley, MI' },
  { city: 'Clawson', state: 'MI', label: 'Clawson, MI' },
  { city: 'Rochester', state: 'MI', label: 'Rochester, MI' },
  { city: 'Rochester Hills', state: 'MI', label: 'Rochester Hills, MI' },
  { city: 'Southfield', state: 'MI', label: 'Southfield, MI' },
  { city: 'Sterling Heights', state: 'MI', label: 'Sterling Heights, MI' },
  { city: 'Warren', state: 'MI', label: 'Warren, MI' },
  { city: 'Ann Arbor', state: 'MI', label: 'Ann Arbor, MI' },
  { city: 'Livonia', state: 'MI', label: 'Livonia, MI' },
  { city: 'Canton', state: 'MI', label: 'Canton, MI' },
  { city: 'Novi', state: 'MI', label: 'Novi, MI' },
  { city: 'Dearborn', state: 'MI', label: 'Dearborn, MI' },
  { city: 'Farmington Hills', state: 'MI', label: 'Farmington Hills, MI' },
  { city: 'West Bloomfield', state: 'MI', label: 'West Bloomfield, MI' },
  { city: 'Bloomfield Hills', state: 'MI', label: 'Bloomfield Hills, MI' },
  { city: 'Grosse Pointe', state: 'MI', label: 'Grosse Pointe, MI' },
  { city: 'Plymouth', state: 'MI', label: 'Plymouth, MI' },
  { city: 'Northville', state: 'MI', label: 'Northville, MI' },
  { city: 'Macomb', state: 'MI', label: 'Macomb, MI' },
  { city: 'Shelby Township', state: 'MI', label: 'Shelby Township, MI' },
  { city: 'Clinton Township', state: 'MI', label: 'Clinton Township, MI' },
  { city: 'Waterford', state: 'MI', label: 'Waterford, MI' },
  { city: 'Auburn Hills', state: 'MI', label: 'Auburn Hills, MI' },
  { city: 'Grand Rapids', state: 'MI', label: 'Grand Rapids, MI' },
  { city: 'Kalamazoo', state: 'MI', label: 'Kalamazoo, MI' },
  { city: 'Lansing', state: 'MI', label: 'Lansing, MI' },

  // Texas
  { city: 'Austin', state: 'TX', label: 'Austin, TX' },
  { city: 'Houston', state: 'TX', label: 'Houston, TX' },
  { city: 'Dallas', state: 'TX', label: 'Dallas, TX' },
  { city: 'San Antonio', state: 'TX', label: 'San Antonio, TX' },
  { city: 'Fort Worth', state: 'TX', label: 'Fort Worth, TX' },
  { city: 'Plano', state: 'TX', label: 'Plano, TX' },
  { city: 'Frisco', state: 'TX', label: 'Frisco, TX' },
  { city: 'McKinney', state: 'TX', label: 'McKinney, TX' },
  { city: 'Arlington', state: 'TX', label: 'Arlington, TX' },
  { city: 'Round Rock', state: 'TX', label: 'Round Rock, TX' },
  { city: 'The Woodlands', state: 'TX', label: 'The Woodlands, TX' },
  { city: 'Katy', state: 'TX', label: 'Katy, TX' },
  { city: 'Sugar Land', state: 'TX', label: 'Sugar Land, TX' },
  { city: 'El Paso', state: 'TX', label: 'El Paso, TX' },
  { city: 'Corpus Christi', state: 'TX', label: 'Corpus Christi, TX' },
  { city: 'Lubbock', state: 'TX', label: 'Lubbock, TX' },

  // Illinois
  { city: 'Chicago', state: 'IL', label: 'Chicago, IL' },
  { city: 'Naperville', state: 'IL', label: 'Naperville, IL' },
  { city: 'Aurora', state: 'IL', label: 'Aurora, IL' },
  { city: 'Rockford', state: 'IL', label: 'Rockford, IL' },
  { city: 'Joliet', state: 'IL', label: 'Joliet, IL' },
  { city: 'Evanston', state: 'IL', label: 'Evanston, IL' },
  { city: 'Schaumburg', state: 'IL', label: 'Schaumburg, IL' },
  { city: 'Peoria', state: 'IL', label: 'Peoria, IL' },

  // California
  { city: 'Los Angeles', state: 'CA', label: 'Los Angeles, CA' },
  { city: 'San Diego', state: 'CA', label: 'San Diego, CA' },
  { city: 'San Jose', state: 'CA', label: 'San Jose, CA' },
  { city: 'San Francisco', state: 'CA', label: 'San Francisco, CA' },
  { city: 'Fresno', state: 'CA', label: 'Fresno, CA' },
  { city: 'Sacramento', state: 'CA', label: 'Sacramento, CA' },
  { city: 'Long Beach', state: 'CA', label: 'Long Beach, CA' },
  { city: 'Oakland', state: 'CA', label: 'Oakland, CA' },
  { city: 'Bakersfield', state: 'CA', label: 'Bakersfield, CA' },
  { city: 'Anaheim', state: 'CA', label: 'Anaheim, CA' },
  { city: 'Santa Ana', state: 'CA', label: 'Santa Ana, CA' },
  { city: 'Riverside', state: 'CA', label: 'Riverside, CA' },
  { city: 'Irvine', state: 'CA', label: 'Irvine, CA' },
  { city: 'Pasadena', state: 'CA', label: 'Pasadena, CA' },
  { city: 'Glendale', state: 'CA', label: 'Glendale, CA' },
  { city: 'Huntington Beach', state: 'CA', label: 'Huntington Beach, CA' },
  { city: 'Santa Clarita', state: 'CA', label: 'Santa Clarita, CA' },
  { city: 'Fremont', state: 'CA', label: 'Fremont, CA' },
  { city: 'Modesto', state: 'CA', label: 'Modesto, CA' },
  { city: 'Fontana', state: 'CA', label: 'Fontana, CA' },
  { city: 'San Bernardino', state: 'CA', label: 'San Bernardino, CA' },
  { city: 'Oxnard', state: 'CA', label: 'Oxnard, CA' },
  { city: 'Moreno Valley', state: 'CA', label: 'Moreno Valley, CA' },

  // Florida
  { city: 'Miami', state: 'FL', label: 'Miami, FL' },
  { city: 'Tampa', state: 'FL', label: 'Tampa, FL' },
  { city: 'Orlando', state: 'FL', label: 'Orlando, FL' },
  { city: 'Jacksonville', state: 'FL', label: 'Jacksonville, FL' },
  { city: 'St. Petersburg', state: 'FL', label: 'St. Petersburg, FL' },
  { city: 'Hialeah', state: 'FL', label: 'Hialeah, FL' },
  { city: 'Port St. Lucie', state: 'FL', label: 'Port St. Lucie, FL' },
  { city: 'Cape Coral', state: 'FL', label: 'Cape Coral, FL' },
  { city: 'Tallahassee', state: 'FL', label: 'Tallahassee, FL' },
  { city: 'Fort Lauderdale', state: 'FL', label: 'Fort Lauderdale, FL' },
  { city: 'Pembroke Pines', state: 'FL', label: 'Pembroke Pines, FL' },
  { city: 'Hollywood', state: 'FL', label: 'Hollywood, FL' },
  { city: 'Gainesville', state: 'FL', label: 'Gainesville, FL' },
  { city: 'Sarasota', state: 'FL', label: 'Sarasota, FL' },
  { city: 'Naples', state: 'FL', label: 'Naples, FL' },
  { city: 'West Palm Beach', state: 'FL', label: 'West Palm Beach, FL' },
  { city: 'Clearwater', state: 'FL', label: 'Clearwater, FL' },

  // New York
  { city: 'New York', state: 'NY', label: 'New York, NY' },
  { city: 'Brooklyn', state: 'NY', label: 'Brooklyn, NY' },
  { city: 'Queens', state: 'NY', label: 'Queens, NY' },
  { city: 'Manhattan', state: 'NY', label: 'Manhattan, NY' },
  { city: 'Bronx', state: 'NY', label: 'Bronx, NY' },
  { city: 'Staten Island', state: 'NY', label: 'Staten Island, NY' },
  { city: 'Buffalo', state: 'NY', label: 'Buffalo, NY' },
  { city: 'Rochester', state: 'NY', label: 'Rochester, NY' },
  { city: 'Yonkers', state: 'NY', label: 'Yonkers, NY' },
  { city: 'Syracuse', state: 'NY', label: 'Syracuse, NY' },
  { city: 'Albany', state: 'NY', label: 'Albany, NY' },

  // Arizona
  { city: 'Phoenix', state: 'AZ', label: 'Phoenix, AZ' },
  { city: 'Tucson', state: 'AZ', label: 'Tucson, AZ' },
  { city: 'Mesa', state: 'AZ', label: 'Mesa, AZ' },
  { city: 'Chandler', state: 'AZ', label: 'Chandler, AZ' },
  { city: 'Scottsdale', state: 'AZ', label: 'Scottsdale, AZ' },
  { city: 'Glendale', state: 'AZ', label: 'Glendale, AZ' },
  { city: 'Gilbert', state: 'AZ', label: 'Gilbert, AZ' },
  { city: 'Tempe', state: 'AZ', label: 'Tempe, AZ' },
  { city: 'Peoria', state: 'AZ', label: 'Peoria, AZ' },
  { city: 'Surprise', state: 'AZ', label: 'Surprise, AZ' },

  // Washington & Oregon
  { city: 'Seattle', state: 'WA', label: 'Seattle, WA' },
  { city: 'Spokane', state: 'WA', label: 'Spokane, WA' },
  { city: 'Tacoma', state: 'WA', label: 'Tacoma, WA' },
  { city: 'Vancouver', state: 'WA', label: 'Vancouver, WA' },
  { city: 'Bellevue', state: 'WA', label: 'Bellevue, WA' },
  { city: 'Kent', state: 'WA', label: 'Kent, WA' },
  { city: 'Everett', state: 'WA', label: 'Everett, WA' },
  { city: 'Renton', state: 'WA', label: 'Renton, WA' },
  { city: 'Portland', state: 'OR', label: 'Portland, OR' },
  { city: 'Salem', state: 'OR', label: 'Salem, OR' },
  { city: 'Eugene', state: 'OR', label: 'Eugene, OR' },
  { city: 'Gresham', state: 'OR', label: 'Gresham, OR' },
  { city: 'Hillsboro', state: 'OR', label: 'Hillsboro, OR' },
  { city: 'Beaverton', state: 'OR', label: 'Beaverton, OR' },
  { city: 'Bend', state: 'OR', label: 'Bend, OR' },

  // Georgia & Carolinas
  { city: 'Atlanta', state: 'GA', label: 'Atlanta, GA' },
  { city: 'Columbus', state: 'GA', label: 'Columbus, GA' },
  { city: 'Augusta', state: 'GA', label: 'Augusta, GA' },
  { city: 'Macon', state: 'GA', label: 'Macon, GA' },
  { city: 'Savannah', state: 'GA', label: 'Savannah, GA' },
  { city: 'Athens', state: 'GA', label: 'Athens, GA' },
  { city: 'Sandy Springs', state: 'GA', label: 'Sandy Springs, GA' },
  { city: 'Roswell', state: 'GA', label: 'Roswell, GA' },
  { city: 'Alpharetta', state: 'GA', label: 'Alpharetta, GA' },
  { city: 'Marietta', state: 'GA', label: 'Marietta, GA' },
  { city: 'Charlotte', state: 'NC', label: 'Charlotte, NC' },
  { city: 'Raleigh', state: 'NC', label: 'Raleigh, NC' },
  { city: 'Greensboro', state: 'NC', label: 'Greensboro, NC' },
  { city: 'Durham', state: 'NC', label: 'Durham, NC' },
  { city: 'Winston-Salem', state: 'NC', label: 'Winston-Salem, NC' },
  { city: 'Fayetteville', state: 'NC', label: 'Fayetteville, NC' },
  { city: 'Cary', state: 'NC', label: 'Cary, NC' },
  { city: 'Wilmington', state: 'NC', label: 'Wilmington, NC' },
  { city: 'Charleston', state: 'SC', label: 'Charleston, SC' },
  { city: 'Columbia', state: 'SC', label: 'Columbia, SC' },
  { city: 'Greenville', state: 'SC', label: 'Greenville, SC' },

  // Colorado & Mountain West
  { city: 'Denver', state: 'CO', label: 'Denver, CO' },
  { city: 'Colorado Springs', state: 'CO', label: 'Colorado Springs, CO' },
  { city: 'Aurora', state: 'CO', label: 'Aurora, CO' },
  { city: 'Fort Collins', state: 'CO', label: 'Fort Collins, CO' },
  { city: 'Lakewood', state: 'CO', label: 'Lakewood, CO' },
  { city: 'Thornton', state: 'CO', label: 'Thornton, CO' },
  { city: 'Arvada', state: 'CO', label: 'Arvada, CO' },
  { city: 'Westminster', state: 'CO', label: 'Westminster, CO' },
  { city: 'Boulder', state: 'CO', label: 'Boulder, CO' },
  { city: 'Salt Lake City', state: 'UT', label: 'Salt Lake City, UT' },
  { city: 'West Valley City', state: 'UT', label: 'West Valley City, UT' },
  { city: 'Provo', state: 'UT', label: 'Provo, UT' },
  { city: 'West Jordan', state: 'UT', label: 'West Jordan, UT' },
  { city: 'Orem', state: 'UT', label: 'Orem, UT' },
  { city: 'Sandy', state: 'UT', label: 'Sandy, UT' },
  { city: 'St. George', state: 'UT', label: 'St. George, UT' },
  { city: 'Las Vegas', state: 'NV', label: 'Las Vegas, NV' },
  { city: 'Henderson', state: 'NV', label: 'Henderson, NV' },
  { city: 'Reno', state: 'NV', label: 'Reno, NV' },
  { city: 'North Las Vegas', state: 'NV', label: 'North Las Vegas, NV' },
  { city: 'Boise', state: 'ID', label: 'Boise, ID' },
  { city: 'Meridian', state: 'ID', label: 'Meridian, ID' },
  { city: 'Nampa', state: 'ID', label: 'Nampa, ID' },

  // Midwest & Plains
  { city: 'Columbus', state: 'OH', label: 'Columbus, OH' },
  { city: 'Cleveland', state: 'OH', label: 'Cleveland, OH' },
  { city: 'Cincinnati', state: 'OH', label: 'Cincinnati, OH' },
  { city: 'Toledo', state: 'OH', label: 'Toledo, OH' },
  { city: 'Akron', state: 'OH', label: 'Akron, OH' },
  { city: 'Dayton', state: 'OH', label: 'Dayton, OH' },
  { city: 'Indianapolis', state: 'IN', label: 'Indianapolis, IN' },
  { city: 'Fort Wayne', state: 'IN', label: 'Fort Wayne, IN' },
  { city: 'Evansville', state: 'IN', label: 'Evansville, IN' },
  { city: 'South Bend', state: 'IN', label: 'South Bend, IN' },
  { city: 'Carmel', state: 'IN', label: 'Carmel, IN' },
  { city: 'Fishers', state: 'IN', label: 'Fishers, IN' },
  { city: 'Milwaukee', state: 'WI', label: 'Milwaukee, WI' },
  { city: 'Madison', state: 'WI', label: 'Madison, WI' },
  { city: 'Green Bay', state: 'WI', label: 'Green Bay, WI' },
  { city: 'Minneapolis', state: 'MN', label: 'Minneapolis, MN' },
  { city: 'St. Paul', state: 'MN', label: 'St. Paul, MN' },
  { city: 'Rochester', state: 'MN', label: 'Rochester, MN' },
  { city: 'Kansas City', state: 'MO', label: 'Kansas City, MO' },
  { city: 'St. Louis', state: 'MO', label: 'St. Louis, MO' },
  { city: 'Springfield', state: 'MO', label: 'Springfield, MO' },
  { city: 'Columbia', state: 'MO', label: 'Columbia, MO' },
  { city: 'Omaha', state: 'NE', label: 'Omaha, NE' },
  { city: 'Lincoln', state: 'NE', label: 'Lincoln, NE' },
  { city: 'Des Moines', state: 'IA', label: 'Des Moines, IA' },
  { city: 'Cedar Rapids', state: 'IA', label: 'Cedar Rapids, IA' },
  { city: 'Wichita', state: 'KS', label: 'Wichita, KS' },
  { city: 'Overland Park', state: 'KS', label: 'Overland Park, KS' },
  { city: 'Kansas City', state: 'KS', label: 'Kansas City, KS' },
  { city: 'Olathe', state: 'KS', label: 'Olathe, KS' },
  { city: 'Topeka', state: 'KS', label: 'Topeka, KS' },
  { city: 'Oklahoma City', state: 'OK', label: 'Oklahoma City, OK' },
  { city: 'Tulsa', state: 'OK', label: 'Tulsa, OK' },
  { city: 'Norman', state: 'OK', label: 'Norman, OK' },
  { city: 'Broken Arrow', state: 'OK', label: 'Broken Arrow, OK' },

  // South & Mid-Atlantic
  { city: 'Nashville', state: 'TN', label: 'Nashville, TN' },
  { city: 'Memphis', state: 'TN', label: 'Memphis, TN' },
  { city: 'Knoxville', state: 'TN', label: 'Knoxville, TN' },
  { city: 'Chattanooga', state: 'TN', label: 'Chattanooga, TN' },
  { city: 'Clarksville', state: 'TN', label: 'Clarksville, TN' },
  { city: 'Murfreesboro', state: 'TN', label: 'Murfreesboro, TN' },
  { city: 'Franklin', state: 'TN', label: 'Franklin, TN' },
  { city: 'Louisville', state: 'KY', label: 'Louisville, KY' },
  { city: 'Lexington', state: 'KY', label: 'Lexington, KY' },
  { city: 'Bowling Green', state: 'KY', label: 'Bowling Green, KY' },
  { city: 'Birmingham', state: 'AL', label: 'Birmingham, AL' },
  { city: 'Montgomery', state: 'AL', label: 'Montgomery, AL' },
  { city: 'Huntsville', state: 'AL', label: 'Huntsville, AL' },
  { city: 'Mobile', state: 'AL', label: 'Mobile, AL' },
  { city: 'New Orleans', state: 'LA', label: 'New Orleans, LA' },
  { city: 'Baton Rouge', state: 'LA', label: 'Baton Rouge, LA' },
  { city: 'Shreveport', state: 'LA', label: 'Shreveport, LA' },
  { city: 'Lafayette', state: 'LA', label: 'Lafayette, LA' },
  { city: 'Little Rock', state: 'AR', label: 'Little Rock, AR' },
  { city: 'Fayetteville', state: 'AR', label: 'Fayetteville, AR' },
  { city: 'Fort Smith', state: 'AR', label: 'Fort Smith, AR' },
  { city: 'Jackson', state: 'MS', label: 'Jackson, MS' },
  { city: 'Gulfport', state: 'MS', label: 'Gulfport, MS' },
  { city: 'Virginia Beach', state: 'VA', label: 'Virginia Beach, VA' },
  { city: 'Norfolk', state: 'VA', label: 'Norfolk, VA' },
  { city: 'Chesapeake', state: 'VA', label: 'Chesapeake, VA' },
  { city: 'Richmond', state: 'VA', label: 'Richmond, VA' },
  { city: 'Newport News', state: 'VA', label: 'Newport News, VA' },
  { city: 'Alexandria', state: 'VA', label: 'Alexandria, VA' },
  { city: 'Hampton', state: 'VA', label: 'Hampton, VA' },
  { city: 'Roanoke', state: 'VA', label: 'Roanoke, VA' },
  { city: 'Washington', state: 'DC', label: 'Washington, DC' },
  { city: 'Baltimore', state: 'MD', label: 'Baltimore, MD' },
  { city: 'Frederick', state: 'MD', label: 'Frederick, MD' },
  { city: 'Rockville', state: 'MD', label: 'Rockville, MD' },
  { city: 'Gaithersburg', state: 'MD', label: 'Gaithersburg, MD' },
  { city: 'Annapolis', state: 'MD', label: 'Annapolis, MD' },

  // Northeast & New England
  { city: 'Philadelphia', state: 'PA', label: 'Philadelphia, PA' },
  { city: 'Pittsburgh', state: 'PA', label: 'Pittsburgh, PA' },
  { city: 'Allentown', state: 'PA', label: 'Allentown, PA' },
  { city: 'Erie', state: 'PA', label: 'Erie, PA' },
  { city: 'Reading', state: 'PA', label: 'Reading, PA' },
  { city: 'Scranton', state: 'PA', label: 'Scranton, PA' },
  { city: 'Newark', state: 'NJ', label: 'Newark, NJ' },
  { city: 'Jersey City', state: 'NJ', label: 'Jersey City, NJ' },
  { city: 'Paterson', state: 'NJ', label: 'Paterson, NJ' },
  { city: 'Elizabeth', state: 'NJ', label: 'Elizabeth, NJ' },
  { city: 'Trenton', state: 'NJ', label: 'Trenton, NJ' },
  { city: 'Boston', state: 'MA', label: 'Boston, MA' },
  { city: 'Worcester', state: 'MA', label: 'Worcester, MA' },
  { city: 'Springfield', state: 'MA', label: 'Springfield, MA' },
  { city: 'Cambridge', state: 'MA', label: 'Cambridge, MA' },
  { city: 'Lowell', state: 'MA', label: 'Lowell, MA' },
  { city: 'Providence', state: 'RI', label: 'Providence, RI' },
  { city: 'Warwick', state: 'RI', label: 'Warwick, RI' },
  { city: 'Bridgeport', state: 'CT', label: 'Bridgeport, CT' },
  { city: 'New Haven', state: 'CT', label: 'New Haven, CT' },
  { city: 'Stamford', state: 'CT', label: 'Stamford, CT' },
  { city: 'Hartford', state: 'CT', label: 'Hartford, CT' },
  { city: 'Waterbury', state: 'CT', label: 'Waterbury, CT' },
  { city: 'Manchester', state: 'NH', label: 'Manchester, NH' },
  { city: 'Nashua', state: 'NH', label: 'Nashua, NH' },
  { city: 'Portland', state: 'ME', label: 'Portland, ME' },
  { city: 'Burlington', state: 'VT', label: 'Burlington, VT' },

  // Southwest & Others
  { city: 'Albuquerque', state: 'NM', label: 'Albuquerque, NM' },
  { city: 'Las Cruces', state: 'NM', label: 'Las Cruces, NM' },
  { city: 'Rio Rancho', state: 'NM', label: 'Rio Rancho, NM' },
  { city: 'Santa Fe', state: 'NM', label: 'Santa Fe, NM' },
  { city: 'Honolulu', state: 'HI', label: 'Honolulu, HI' },
  { city: 'Anchorage', state: 'AK', label: 'Anchorage, AK' },
];

/**
 * Normalizes input for lenient fuzzy comparisons (removes spaces, punctuation, lowercase).
 * E.g. "royaloak" or "royal oak," both become "royaloak".
 */
export function normalizeCityQuery(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Suggests matching US cities based on a raw user query string.
 * Supports prefix matching, token matching, and space-insensitive matching.
 */
export function suggestCities(query: string, maxResults = 8): CitySuggestion[] {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) return [];

  const cleanQuery = normalizeCityQuery(trimmed);
  if (!cleanQuery) return [];

  const lowerQuery = trimmed.toLowerCase();
  const scored: Array<{ item: CitySuggestion; score: number }> = [];

  for (const item of COMMON_US_CITIES) {
    const cleanCity = normalizeCityQuery(item.city);
    const cleanLabel = normalizeCityQuery(item.label);
    const lowerCity = item.city.toLowerCase();
    const lowerLabel = item.label.toLowerCase();

    // Exact label match
    if (lowerLabel === lowerQuery || lowerCity === lowerQuery) {
      scored.push({ item, score: 100 });
      continue;
    }

    // Exact space-stripped match (e.g. "royaloak" === "royaloak")
    if (cleanCity === cleanQuery || cleanLabel === cleanQuery) {
      scored.push({ item, score: 95 });
      continue;
    }

    // Starts with space-stripped query (e.g. "royal" in "royaloak")
    if (cleanCity.startsWith(cleanQuery)) {
      scored.push({ item, score: 80 - cleanCity.length });
      continue;
    }

    // Starts with regular query (e.g. "royal" -> "Royal Oak")
    if (lowerCity.startsWith(lowerQuery)) {
      scored.push({ item, score: 75 });
      continue;
    }

    // Label starts with query (e.g. "royal oak, m" -> "Royal Oak, MI")
    if (lowerLabel.startsWith(lowerQuery) || cleanLabel.startsWith(cleanQuery)) {
      scored.push({ item, score: 70 });
      continue;
    }

    // Substring match in city
    if (cleanCity.includes(cleanQuery)) {
      scored.push({ item, score: 50 });
      continue;
    }

    // Substring match in state or label
    if (cleanLabel.includes(cleanQuery)) {
      scored.push({ item, score: 40 });
      continue;
    }
  }

  scored.sort((a, b) => b.score - a.score);

  // Deduplicate by label
  const seen = new Set<string>();
  const results: CitySuggestion[] = [];

  for (const { item } of scored) {
    if (!seen.has(item.label)) {
      seen.add(item.label);
      results.push(item);
      if (results.length >= maxResults) break;
    }
  }

  return results;
}
