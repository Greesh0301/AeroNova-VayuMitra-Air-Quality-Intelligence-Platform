export interface CityEntry {
  name: string;
  latitude: number;
  longitude: number;
}

export interface StateEntry {
  state: string;
  type: "State" | "Union Territory";
  capital: string;
  cities: CityEntry[];
}

export interface LocationInfo {
  name: string;
  country: string;
  admin1: string;
  latitude: number;
  longitude: number;
}

export const INDIA_BOUNDS = {
  min_lat: 6.4,
  max_lat: 37.6,
  min_lon: 68.0,
  max_lon: 97.5,
};

export const WMO_WEATHER_LABELS: Record<number, string> = {
  0: "Clear Sky",
  1: "Mainly Clear",
  2: "Partly Cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Depositing Rime Fog",
  51: "Light Drizzle",
  53: "Moderate Drizzle",
  55: "Dense Drizzle",
  61: "Light Rain",
  63: "Moderate Rain",
  65: "Heavy Rain",
  71: "Light Snow",
  73: "Moderate Snow",
  75: "Heavy Snow",
  80: "Light Rain Showers",
  81: "Moderate Rain Showers",
  82: "Violent Rain Showers",
  95: "Thunderstorm",
  96: "Thunderstorm with Hail",
  99: "Severe Thunderstorm",
};

export const INDIA_STATES_DIRECTORY: StateEntry[] = [
  {
    state: "Andhra Pradesh",
    type: "State",
    capital: "Amaravati",
    cities: [
      { name: "Visakhapatnam", latitude: 17.6868, longitude: 83.2185 },
      { name: "Vijayawada", latitude: 16.5062, longitude: 80.648 },
      { name: "Amaravati", latitude: 16.5131, longitude: 80.5165 },
      { name: "Tirupati", latitude: 13.6288, longitude: 79.4192 },
      { name: "Guntur", latitude: 16.3067, longitude: 80.4365 },
    ],
  },
  {
    state: "Arunachal Pradesh",
    type: "State",
    capital: "Itanagar",
    cities: [
      { name: "Itanagar", latitude: 27.0844, longitude: 93.6053 },
      { name: "Tawang", latitude: 27.586, longitude: 91.8594 },
      { name: "Pasighat", latitude: 28.066, longitude: 95.3264 },
    ],
  },
  {
    state: "Assam",
    type: "State",
    capital: "Dispur",
    cities: [
      { name: "Guwahati", latitude: 26.1445, longitude: 91.7362 },
      { name: "Dispur", latitude: 26.1433, longitude: 91.7898 },
      { name: "Silchar", latitude: 24.8333, longitude: 92.7789 },
      { name: "Dibrugarh", latitude: 27.4728, longitude: 94.912 },
      { name: "Jorhat", latitude: 26.7509, longitude: 94.2037 },
    ],
  },
  {
    state: "Bihar",
    type: "State",
    capital: "Patna",
    cities: [
      { name: "Patna", latitude: 25.5941, longitude: 85.1376 },
      { name: "Gaya", latitude: 24.7914, longitude: 85.0002 },
      { name: "Muzaffarpur", latitude: 26.1197, longitude: 85.391 },
      { name: "Bhagalpur", latitude: 25.2425, longitude: 86.9842 },
    ],
  },
  {
    state: "Chhattisgarh",
    type: "State",
    capital: "Raipur",
    cities: [
      { name: "Raipur", latitude: 21.2514, longitude: 81.6296 },
      { name: "Bilaspur", latitude: 22.0797, longitude: 82.1409 },
      { name: "Bhilai", latitude: 21.1938, longitude: 81.3509 },
      { name: "Jagdalpur", latitude: 19.0748, longitude: 82.0085 },
    ],
  },
  {
    state: "Goa",
    type: "State",
    capital: "Panaji",
    cities: [
      { name: "Panaji", latitude: 15.4909, longitude: 73.8278 },
      { name: "Margao", latitude: 15.2832, longitude: 73.9862 },
      { name: "Vasco da Gama", latitude: 15.3982, longitude: 73.8113 },
    ],
  },
  {
    state: "Gujarat",
    type: "State",
    capital: "Gandhinagar",
    cities: [
      { name: "Ahmedabad", latitude: 23.0225, longitude: 72.5714 },
      { name: "Gandhinagar", latitude: 23.2156, longitude: 72.6369 },
      { name: "Surat", latitude: 21.1702, longitude: 72.8311 },
      { name: "Vadodara", latitude: 22.3072, longitude: 73.1812 },
      { name: "Rajkot", latitude: 22.3039, longitude: 70.8022 },
    ],
  },
  {
    state: "Haryana",
    type: "State",
    capital: "Chandigarh",
    cities: [
      { name: "Gurugram", latitude: 28.4595, longitude: 77.0266 },
      { name: "Faridabad", latitude: 28.4089, longitude: 77.3178 },
      { name: "Panipat", latitude: 29.3909, longitude: 76.9635 },
      { name: "Ambala", latitude: 30.3782, longitude: 76.7767 },
      { name: "Hisar", latitude: 29.1492, longitude: 75.7217 },
    ],
  },
  {
    state: "Himachal Pradesh",
    type: "State",
    capital: "Shimla",
    cities: [
      { name: "Shimla", latitude: 31.1048, longitude: 77.1734 },
      { name: "Dharamshala", latitude: 32.219, longitude: 76.3234 },
      { name: "Manali", latitude: 32.2432, longitude: 77.1892 },
      { name: "Solan", latitude: 30.9045, longitude: 77.0967 },
    ],
  },
  {
    state: "Jharkhand",
    type: "State",
    capital: "Ranchi",
    cities: [
      { name: "Ranchi", latitude: 23.3441, longitude: 85.3096 },
      { name: "Jamshedpur", latitude: 22.8046, longitude: 86.2029 },
      { name: "Dhanbad", latitude: 23.7957, longitude: 86.4304 },
      { name: "Bokaro", latitude: 23.6693, longitude: 86.1511 },
    ],
  },
  {
    state: "Karnataka",
    type: "State",
    capital: "Bengaluru",
    cities: [
      { name: "Bengaluru", latitude: 12.9716, longitude: 77.5946 },
      { name: "Mysuru", latitude: 12.2958, longitude: 76.6394 },
      { name: "Mangaluru", latitude: 12.9141, longitude: 74.856 },
      { name: "Hubballi", latitude: 15.3647, longitude: 75.124 },
      { name: "Belagavi", latitude: 15.8497, longitude: 74.4977 },
    ],
  },
  {
    state: "Kerala",
    type: "State",
    capital: "Thiruvananthapuram",
    cities: [
      { name: "Thiruvananthapuram", latitude: 8.5241, longitude: 76.9366 },
      { name: "Kochi", latitude: 9.9312, longitude: 76.2673 },
      { name: "Kozhikode", latitude: 11.2588, longitude: 75.7804 },
      { name: "Thrissur", latitude: 10.5276, longitude: 76.2144 },
    ],
  },
  {
    state: "Madhya Pradesh",
    type: "State",
    capital: "Bhopal",
    cities: [
      { name: "Bhopal", latitude: 23.2599, longitude: 77.4126 },
      { name: "Indore", latitude: 22.7196, longitude: 75.8577 },
      { name: "Gwalior", latitude: 26.2183, longitude: 78.1828 },
      { name: "Jabalpur", latitude: 23.1815, longitude: 79.9864 },
      { name: "Ujjain", latitude: 23.1765, longitude: 75.7885 },
    ],
  },
  {
    state: "Maharashtra",
    type: "State",
    capital: "Mumbai",
    cities: [
      { name: "Mumbai", latitude: 19.076, longitude: 72.8777 },
      { name: "Pune", latitude: 18.5204, longitude: 73.8567 },
      { name: "Nagpur", latitude: 21.1458, longitude: 79.0882 },
      { name: "Nashik", latitude: 19.9975, longitude: 73.7898 },
      { name: "Thane", latitude: 19.2183, longitude: 72.9781 },
      { name: "Navi Mumbai", latitude: 19.033, longitude: 73.0297 },
      { name: "Chhatrapati Sambhajinagar", latitude: 19.8762, longitude: 75.3433 },
    ],
  },
  {
    state: "Manipur",
    type: "State",
    capital: "Imphal",
    cities: [
      { name: "Imphal", latitude: 24.817, longitude: 93.9368 },
      { name: "Thoubal", latitude: 24.634, longitude: 93.9856 },
    ],
  },
  {
    state: "Meghalaya",
    type: "State",
    capital: "Shillong",
    cities: [
      { name: "Shillong", latitude: 25.5788, longitude: 91.8933 },
      { name: "Tura", latitude: 25.5141, longitude: 90.2032 },
    ],
  },
  {
    state: "Mizoram",
    type: "State",
    capital: "Aizawl",
    cities: [
      { name: "Aizawl", latitude: 23.7271, longitude: 92.7176 },
      { name: "Lunglei", latitude: 22.8883, longitude: 92.7347 },
    ],
  },
  {
    state: "Nagaland",
    type: "State",
    capital: "Kohima",
    cities: [
      { name: "Kohima", latitude: 25.6751, longitude: 94.1086 },
      { name: "Dimapur", latitude: 25.9091, longitude: 93.7266 },
    ],
  },
  {
    state: "Odisha",
    type: "State",
    capital: "Bhubaneswar",
    cities: [
      { name: "Bhubaneswar", latitude: 20.2961, longitude: 85.8245 },
      { name: "Cuttack", latitude: 20.4625, longitude: 85.883 },
      { name: "Rourkela", latitude: 22.2604, longitude: 84.8536 },
      { name: "Puri", latitude: 19.8135, longitude: 85.8312 },
    ],
  },
  {
    state: "Punjab",
    type: "State",
    capital: "Chandigarh",
    cities: [
      { name: "Ludhiana", latitude: 30.901, longitude: 75.8573 },
      { name: "Amritsar", latitude: 31.634, longitude: 74.8723 },
      { name: "Jalandhar", latitude: 31.326, longitude: 75.5762 },
      { name: "Patiala", latitude: 30.3398, longitude: 76.3869 },
    ],
  },
  {
    state: "Rajasthan",
    type: "State",
    capital: "Jaipur",
    cities: [
      { name: "Jaipur", latitude: 26.9124, longitude: 75.7873 },
      { name: "Jodhpur", latitude: 26.2389, longitude: 73.0243 },
      { name: "Udaipur", latitude: 24.5854, longitude: 73.7125 },
      { name: "Kota", latitude: 25.2138, longitude: 75.8648 },
      { name: "Bikaner", latitude: 28.0229, longitude: 73.3119 },
    ],
  },
  {
    state: "Sikkim",
    type: "State",
    capital: "Gangtok",
    cities: [
      { name: "Gangtok", latitude: 27.3389, longitude: 88.6065 },
      { name: "Namchi", latitude: 27.1667, longitude: 88.3638 },
    ],
  },
  {
    state: "Tamil Nadu",
    type: "State",
    capital: "Chennai",
    cities: [
      { name: "Chennai", latitude: 13.0827, longitude: 80.2707 },
      { name: "Coimbatore", latitude: 11.0168, longitude: 76.9558 },
      { name: "Madurai", latitude: 9.9252, longitude: 78.1198 },
      { name: "Tiruchirappalli", latitude: 10.7905, longitude: 78.7047 },
      { name: "Salem", latitude: 11.6643, longitude: 78.146 },
    ],
  },
  {
    state: "Telangana",
    type: "State",
    capital: "Hyderabad",
    cities: [
      { name: "Hyderabad", latitude: 17.385, longitude: 78.4867 },
      { name: "Warangal", latitude: 17.9689, longitude: 79.5941 },
      { name: "Nizamabad", latitude: 18.6725, longitude: 78.0941 },
      { name: "Karimnagar", latitude: 18.4386, longitude: 79.1288 },
    ],
  },
  {
    state: "Tripura",
    type: "State",
    capital: "Agartala",
    cities: [
      { name: "Agartala", latitude: 23.8315, longitude: 91.2868 },
      { name: "Udaipur (Tripura)", latitude: 23.5333, longitude: 91.4833 },
    ],
  },
  {
    state: "Uttar Pradesh",
    type: "State",
    capital: "Lucknow",
    cities: [
      { name: "Lucknow", latitude: 26.8467, longitude: 80.9462 },
      { name: "Kanpur", latitude: 26.4499, longitude: 80.3319 },
      { name: "Varanasi", latitude: 25.3176, longitude: 82.9739 },
      { name: "Agra", latitude: 27.1767, longitude: 78.0081 },
      { name: "Noida", latitude: 28.5355, longitude: 77.391 },
      { name: "Ghaziabad", latitude: 28.6692, longitude: 77.4538 },
      { name: "Prayagraj", latitude: 25.4358, longitude: 81.8463 },
    ],
  },
  {
    state: "Uttarakhand",
    type: "State",
    capital: "Dehradun",
    cities: [
      { name: "Dehradun", latitude: 30.3165, longitude: 78.0322 },
      { name: "Haridwar", latitude: 29.9457, longitude: 78.1642 },
      { name: "Rishikesh", latitude: 30.0869, longitude: 78.2676 },
      { name: "Nainital", latitude: 29.3919, longitude: 79.4542 },
    ],
  },
  {
    state: "West Bengal",
    type: "State",
    capital: "Kolkata",
    cities: [
      { name: "Kolkata", latitude: 22.5726, longitude: 88.3639 },
      { name: "Howrah", latitude: 22.5958, longitude: 88.2636 },
      { name: "Siliguri", latitude: 26.7271, longitude: 88.3953 },
      { name: "Durgapur", latitude: 23.5204, longitude: 87.3119 },
      { name: "Darjeeling", latitude: 27.041, longitude: 88.2663 },
    ],
  },
  {
    state: "Andaman and Nicobar Islands",
    type: "Union Territory",
    capital: "Port Blair",
    cities: [{ name: "Port Blair", latitude: 11.6234, longitude: 92.7265 }],
  },
  {
    state: "Chandigarh",
    type: "Union Territory",
    capital: "Chandigarh",
    cities: [{ name: "Chandigarh", latitude: 30.7333, longitude: 76.7794 }],
  },
  {
    state: "Dadra and Nagar Haveli and Daman and Diu",
    type: "Union Territory",
    capital: "Daman",
    cities: [
      { name: "Daman", latitude: 20.3974, longitude: 72.8328 },
      { name: "Silvassa", latitude: 20.2763, longitude: 73.0083 },
      { name: "Diu", latitude: 20.7144, longitude: 70.9874 },
    ],
  },
  {
    state: "Delhi",
    type: "Union Territory",
    capital: "New Delhi",
    cities: [
      { name: "Delhi", latitude: 28.6139, longitude: 77.209 },
      { name: "New Delhi", latitude: 28.6139, longitude: 77.209 },
    ],
  },
  {
    state: "Jammu and Kashmir",
    type: "Union Territory",
    capital: "Srinagar",
    cities: [
      { name: "Srinagar", latitude: 34.0837, longitude: 74.7973 },
      { name: "Jammu", latitude: 32.7266, longitude: 74.857 },
      { name: "Anantnag", latitude: 33.7311, longitude: 75.1487 },
    ],
  },
  {
    state: "Ladakh",
    type: "Union Territory",
    capital: "Leh",
    cities: [
      { name: "Leh", latitude: 34.1526, longitude: 77.5771 },
      { name: "Kargil", latitude: 34.5539, longitude: 76.1349 },
    ],
  },
  {
    state: "Lakshadweep",
    type: "Union Territory",
    capital: "Kavaratti",
    cities: [{ name: "Kavaratti", latitude: 10.5669, longitude: 72.642 }],
  },
  {
    state: "Puducherry",
    type: "Union Territory",
    capital: "Puducherry",
    cities: [
      { name: "Puducherry", latitude: 11.9416, longitude: 79.8083 },
      { name: "Karaikal", latitude: 10.9254, longitude: 79.838 },
    ],
  },
];

export const KNOWN_CITY_COORDS: Record<string, LocationInfo> = {};
for (const st of INDIA_STATES_DIRECTORY) {
  const capEntry = st.cities.find((c) => c.name === st.capital) ?? st.cities[0];
  KNOWN_CITY_COORDS[st.state.toLowerCase()] = {
    name: `${capEntry.name} (${st.state})`,
    country: "India",
    admin1: st.state,
    latitude: capEntry.latitude,
    longitude: capEntry.longitude,
  };
  for (const city of st.cities) {
    KNOWN_CITY_COORDS[city.name.toLowerCase()] = {
      name: city.name,
      country: "India",
      admin1: st.state,
      latitude: city.latitude,
      longitude: city.longitude,
    };
  }
}

const CITY_ALIASES: Record<string, string> = {
  bombay: "mumbai",
  bangalore: "bengaluru",
  mysore: "mysuru",
  mangalore: "mangaluru",
  madras: "chennai",
  calcutta: "kolkata",
  trivandrum: "thiruvananthapuram",
  cochin: "kochi",
  calicut: "kozhikode",
  gurgaon: "gurugram",
  allahabad: "prayagraj",
  baroda: "vadodara",
  poona: "pune",
  pondicherry: "puducherry",
  aurangabad: "chhatrapati sambhajinagar",
  benares: "varanasi",
  vizag: "visakhapatnam",
  "jammu & kashmir": "jammu and kashmir",
  "andaman & nicobar": "andaman and nicobar islands",
  "andaman and nicobar": "andaman and nicobar islands",
};

for (const [alias, target] of Object.entries(CITY_ALIASES)) {
  if (KNOWN_CITY_COORDS[target]) {
    KNOWN_CITY_COORDS[alias] = { ...KNOWN_CITY_COORDS[target] };
  }
}

export function getIndiaLocationsDirectory() {
  const flatOptions: Array<{ label: string; value: string; state: string; kind: string }> = [];
  for (const st of INDIA_STATES_DIRECTORY) {
    flatOptions.push({
      label: `${st.state} (${st.type})`,
      value: st.state,
      state: st.state,
      kind: st.type,
    });
    for (const c of st.cities) {
      flatOptions.push({
        label: `${c.name}, ${st.state}`,
        value: c.name,
        state: st.state,
        kind: "City",
      });
    }
  }
  return {
    country: "India",
    total_states_and_uts: INDIA_STATES_DIRECTORY.length,
    states: INDIA_STATES_DIRECTORY.map((s) => ({
      state: s.state,
      type: s.type,
      capital: s.capital,
      cities: s.cities.map((c) => c.name),
    })),
    options: flatOptions,
  };
}

export function isWithinIndia(
  lat: unknown,
  lon: unknown,
  countryCode?: string | null
): boolean {
  const latF = Number(lat);
  const lonF = Number(lon);
  if (!Number.isFinite(latF) || !Number.isFinite(lonF)) return false;
  if (countryCode && String(countryCode).trim() !== "") {
    if (String(countryCode).trim().toUpperCase() !== "IN") return false;
  }
  return (
    latF >= INDIA_BOUNDS.min_lat &&
    latF <= INDIA_BOUNDS.max_lat &&
    lonF >= INDIA_BOUNDS.min_lon &&
    lonF <= INDIA_BOUNDS.max_lon
  );
}
