<<<<<<< HEAD
const API_URL = "/api/data";

const DEFAULT_LOCATION = {
    lat: 19.0760,
    lon: 72.8777,
    name: "Mumbai"
};

const $ = id => document.getElementById(id);

let currentLocation = { ...DEFAULT_LOCATION };

/* =========================
   BASIC FUNCTIONS
========================= */

function setText(id, value) {
    const element = $(id);

    if (element && value !== undefined && value !== null) {
        element.textContent = value;
    }
}

function getValue(object, ...keys) {
    for (const key of keys) {
        if (object && object[key] !== undefined && object[key] !== null) {
            return object[key];
        }
    }

    return null;
}

function formatNumber(value, digits = 1) {
    const number = Number(value);

    return Number.isFinite(number)
        ? Number(number.toFixed(digits)).toString()
        : "--";
}

function setGreeting() {
    const now = new Date();
    const hour = now.getHours();

    let greeting;

    if (hour < 12) {
        greeting = "Good morning!";
    } else if (hour < 17) {
        greeting = "Good afternoon!";
    } else {
        greeting = "Good evening!";
    }

    setText("greeting", greeting);

    setText(
        "dateText",
        now.toLocaleDateString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
        })
    );
}

/* =========================
   AIR QUALITY LEVELS
========================= */

function getAQILevel(aqi) {

    if (aqi <= 50) {
        return {
            key: "good",
            label: "Good",
            color: "#36a873",

            headline: "The air is looking fresh!",

            advice:
                "It is a good time to enjoy outdoor activities.",

            alert:
                "A good-air day",

            message:
                "Air quality is satisfactory. Enjoy the outdoors while continuing clean-air habits.",

            tips: [
                "Enjoy outdoor walks and activities.",
                "Keep choosing greener ways to travel.",
                "Check again later for updated conditions."
            ]
        };
    }

    if (aqi <= 100) {
        return {
            key: "moderate",
            label: "Moderate",
            color: "#d7a33b",

            headline: "Air quality is acceptable.",

            advice:
                "Sensitive people may prefer lighter outdoor activity.",

            alert:
                "A little care goes a long way",

            message:
                "Air quality is acceptable, but unusually sensitive people may experience some discomfort.",

            tips: [
                "Sensitive people should consider shorter outdoor activity.",
                "Avoid unnecessary vehicle idling.",
                "Check the hourly trend before longer outdoor plans."
            ]
        };
    }

    if (aqi <= 200) {
        return {
            key: "bad",
            label: "Poor",
            color: "#e58b45",

            headline: "Take care when spending time outside.",

            advice:
                "Reduce prolonged or heavy outdoor exertion.",

            alert:
                "Consider reducing outdoor exertion",

            message:
                "Poorer air quality can affect sensitive groups. Reduce prolonged outdoor exertion.",

            tips: [
                "Limit long or intense outdoor exercise.",
                "Keep windows closed when outdoor air is poor.",
                "Follow local health advisories if symptoms occur."
            ]
        };
    }

    return {
        key: "worse",
        label: "Very Poor",
        color: "#d75c58",

        headline: "Protect yourself from polluted air.",

        advice:
            "Avoid strenuous outdoor activity and follow local advisories.",

        alert:
            "High pollution — take precautions",

        message:
            "Very poor air quality may affect health. Avoid strenuous outdoor activity and follow local guidance.",

        tips: [
            "Avoid outdoor exercise where possible.",
            "Use a well-fitted protective mask if going outside.",
            "Follow local pollution and health advisories."
        ]
    };
}

/* =========================
   CHANGE CHARACTER IMAGES
========================= */

function updateCharacters(aqi) {

    const image = $("aqiCharacters");

    if (!image || !Number.isFinite(Number(aqi))) {
        return;
    }

    const level = getAQILevel(Number(aqi));

    const imagePath =
        `/static/images/${level.key}.png`;

    if (!image.src.endsWith(imagePath)) {
        image.src = imagePath;
    }

    image.alt =
        `VayuMitra characters showing ${level.label} air quality`;
}

/* =========================
   UPDATE AQI
========================= */

function updateAQI(air) {

    const aqi = Number(
        getValue(air, "us_aqi", "aqi", "usAqi", "AQI")
    );

    if (!Number.isFinite(aqi)) {

        setText("aqiValue", "--");
        setText("aqiStatus", "Unavailable");

        setText(
            "aqiHeadline",
            "Air quality data is unavailable"
        );

        setText(
            "aqiAdvice",
            "Please try refreshing the live data."
        );

        return null;
    }

    const level = getAQILevel(aqi);

    setText("aqiValue", Math.round(aqi));
    setText("aqiStatus", level.label);

    setText("aqiHeadline", level.headline);
    setText("aqiAdvice", level.advice);

    /* Change AQI gauge */

    const gauge = document.querySelector(".gauge");

    if (gauge) {

        const percent = Math.max(
            2,
            Math.min(100, aqi / 300 * 100)
        );

        gauge.style.background =
            `conic-gradient(
                ${level.color} 0 ${percent}%,
                #d9eee1 ${percent}% 100%
            )`;
    }

    /* Change both characters */

    updateCharacters(aqi);

    /* Update alerts */

    setText("alertTitle", level.alert);
    setText("alertMessage", level.message);

    setText("tipOne", level.tips[0]);
    setText("tipTwo", level.tips[1]);
    setText("tipThree", level.tips[2]);

    setText("trendCurrent", Math.round(aqi));

    return aqi;
}

/* =========================
   WEATHER
========================= */

function updateWeather(weather) {

    const temp = getValue(
        weather,
        "temperature_2m",
        "temperature",
        "temp"
    );

    const feels = getValue(
        weather,
        "apparent_temperature",
        "feels_like",
        "feelsLike"
    );

    const humidity = getValue(
        weather,
        "relative_humidity_2m",
        "humidity"
    );

    const wind = getValue(
        weather,
        "wind_speed_10m",
        "wind_speed",
        "wind"
    );

    const code = Number(
        getValue(
            weather,
            "weather_code",
            "weathercode",
            "code"
        )
    );

    setText(
        "temperature",
        temp === null ? "--°C" : `${formatNumber(temp, 0)}°C`
    );

    setText(
        "feelsLike",
        feels === null ? "--°C" : `${formatNumber(feels, 0)}°C`
    );

    setText(
        "humidity",
        humidity === null ? "--%" : `${formatNumber(humidity, 0)}%`
    );

    setText(
        "wind",
        wind === null ? "-- km/h" : `${formatNumber(wind, 1)} km/h`
    );

    const descriptions = {
        0: ["☀️", "Clear sky"],
        1: ["🌤️", "Mainly clear"],
        2: ["⛅", "Partly cloudy"],
        3: ["☁️", "Overcast"],
        45: ["🌫️", "Fog"],
        48: ["🌫️", "Depositing rime fog"],
        51: ["🌦️", "Light drizzle"],
        53: ["🌦️", "Drizzle"],
        55: ["🌧️", "Dense drizzle"],
        61: ["🌦️", "Light rain"],
        63: ["🌧️", "Rain"],
        65: ["🌧️", "Heavy rain"],
        71: ["🌨️", "Light snow"],
        73: ["🌨️", "Snow"],
        75: ["❄️", "Heavy snow"],
        80: ["🌦️", "Rain showers"],
        81: ["🌧️", "Rain showers"],
        82: ["⛈️", "Heavy rain showers"],
        95: ["⛈️", "Thunderstorm"]
    };

    const description =
        descriptions[code] || ["⛅", "Current conditions"];

    setText("weatherIcon", description[0]);
    setText("weatherText", description[1]);

    const time = getValue(
        weather,
        "time",
        "current_time",
        "updated_at"
    );

    setText(
        "weatherTime",
        time
            ? `Latest weather update: ${String(time).replace("T", " ")}`
            : "Latest available weather conditions"
    );
}

/* =========================
   POLLUTANTS
========================= */

function setBar(id, value, maxValue) {

    const element = $(id);

    if (!element) return;

    const number = Number(value);

    if (!Number.isFinite(number)) {
        element.style.width = "0%";
        return;
    }

    const percentage = Math.max(
        0,
        Math.min(100, number / maxValue * 100)
    );

    element.style.width = percentage + "%";
}

function updatePollutants(air) {

    const pollutants = [
        {
            id: "pm25",
            bar: "barPm25",
            keys: ["pm2_5", "pm25", "pm2.5"],
            max: 100
        },
        {
            id: "pm10",
            bar: "barPm10",
            keys: ["pm10"],
            max: 150
        },
        {
            id: "no2",
            bar: "barNo2",
            keys: ["nitrogen_dioxide", "no2"],
            max: 200
        },
        {
            id: "co",
            bar: "barCo",
            keys: ["carbon_monoxide", "co"],
            max: 10000
        },
        {
            id: "o3",
            bar: "barO3",
            keys: ["ozone", "o3"],
            max: 200
        },
        {
            id: "so2",
            bar: "barSo2",
            keys: ["sulphur_dioxide", "sulfur_dioxide", "so2"],
            max: 200
        }
    ];

    pollutants.forEach(item => {

        const value = getValue(
            air,
            ...item.keys
        );

        setText(
            item.id,
            formatNumber(value, 1)
        );

        setBar(
            item.bar,
            value,
            item.max
        );

    });
}

/* =========================
   AQI TREND GRAPH
========================= */

function renderTrend(data, air) {

    const svg = $("trendChart");

    if (!svg) return;

    const hourly =
        air.hourly ||
        data.hourly ||
        (data.forecast && data.forecast.hourly) ||
        {};

    const values =
        hourly.us_aqi ||
        hourly.aqi ||
        air.hourly_aqi ||
        data.hourly_aqi;

    const times =
        hourly.time ||
        data.hourly_time ||
        [];

    if (!Array.isArray(values) || !values.length) {

        svg.innerHTML = `
            <text x="450" y="140"
                text-anchor="middle"
                fill="#55718a">
                Hourly forecast is not available.
            </text>
        `;

        return;
    }

    const numbers = values
        .map(Number)
        .filter(Number.isFinite)
        .slice(0, 24);

    if (!numbers.length) return;

    const min = Math.min(...numbers);
    const max = Math.max(...numbers);

    const low = Math.min(0, min - 10);
    const high = Math.max(100, max + 10);

    const points = numbers.map((value, index) => {

        const x =
            35 + index * 830 / Math.max(1, numbers.length - 1);

        const y =
            225 - ((value - low) / (high - low || 1)) * 180;

        return [x, y];
    });

    const line = points
        .map(point => point.join(","))
        .join(" ");

    const area =
        `35,235 ${line} ${points[points.length - 1][0]},235`;

    const labels = points
        .filter((point, index) => index % 4 === 0)
        .map(point => {

            const index = points.indexOf(point);

            const label = times[index]
                ? String(times[index]).slice(11, 16)
                : `${index}:00`;

            return `
                <text x="${point[0]}" y="265"
                    text-anchor="middle"
                    font-size="12"
                    fill="#78918a">
                    ${label}
                </text>
            `;
        })
        .join("");

    svg.innerHTML = `

        <defs>
            <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%"
                    stop-color="#52b987"
                    stop-opacity=".28"/>

                <stop offset="100%"
                    stop-color="#52b987"
                    stop-opacity=".02"/>
            </linearGradient>
        </defs>

        <line x1="35" y1="55" x2="865" y2="55"
            stroke="#dcebe2"
            stroke-dasharray="5 7"/>

        <line x1="35" y1="145" x2="865" y2="145"
            stroke="#dcebe2"
            stroke-dasharray="5 7"/>

        <line x1="35" y1="235" x2="865" y2="235"
            stroke="#dcebe2"/>

        <polygon points="${area}"
            fill="url(#trendFill)"/>

        <polyline points="${line}"
            fill="none"
            stroke="#299568"
            stroke-width="4"
            stroke-linecap="round"
            stroke-linejoin="round"/>

        ${points.map(point => `
            <circle cx="${point[0]}"
                cy="${point[1]}"
                r="4"
                fill="#fff"
                stroke="#299568"
                stroke-width="3"/>
        `).join("")}

        ${labels}
    `;

    setText("trendHigh", Math.round(max));
    setText("trendLow", Math.round(min));
}

/* =========================
   LOAD LIVE DATA
========================= */

async function loadData() {

    setText("updateStatus", "Updating live data...");

    try {

        const url =
            `${API_URL}?lat=${encodeURIComponent(currentLocation.lat)}&lon=${encodeURIComponent(currentLocation.lon)}`;

        const response = await fetch(url, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }

        const data = await response.json();

        const air =
            data.air_quality ||
            data.airQuality ||
            data.air ||
            data;

        const weather =
            data.weather ||
            data.weather_data ||
            data.weatherData ||
            data;

        const locationName =
            data.location_name ||
            data.city ||
            currentLocation.name;

        setText(
            "placeName",
            typeof locationName === "string"
                ? locationName
                : currentLocation.name
        );

        /* Update all dashboard sections */

        updateAQI(air);

        updateWeather(weather);

        updatePollutants(air);

        renderTrend(data, air);

        setText(
            "updateStatus",
            `Live • ${new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
            })}`
        );

    } catch (error) {

        console.error("VayuMitra data error:", error);

        setText("updateStatus", "Live data unavailable");

        setText("aqiStatus", "Unavailable");

        setText(
            "aqiHeadline",
            "Unable to load live air quality"
        );

        setText(
            "aqiAdvice",
            "Check your connection and try again."
        );

        setText(
            "weatherText",
            "Weather data unavailable"
        );
    }
}

/* =========================
   LOCATION
========================= */

function useMyLocation() {

    if (!navigator.geolocation) {

        currentLocation = { ...DEFAULT_LOCATION };

        setText("placeName", "Mumbai (default location)");

        loadData();

        return;
    }

    setText("placeName", "Finding your location...");

    navigator.geolocation.getCurrentPosition(

        position => {

            currentLocation = {
                lat: position.coords.latitude,
                lon: position.coords.longitude,
                name: "Your location"
            };

            setText(
                "placeName",
                "Your current location"
            );

            loadData();
        },

        () => {

            currentLocation = { ...DEFAULT_LOCATION };

            setText(
                "placeName",
                "Mumbai (default location)"
            );

            loadData();
        },

        {
            enableHighAccuracy: false,
            timeout: 10000,
            maximumAge: 300000
        }
    );
}

/* =========================
   START DASHBOARD
========================= */

document.addEventListener("DOMContentLoaded", () => {

    setGreeting();

    const locateButton = $("locateBtn");

    if (locateButton) {
        locateButton.addEventListener(
            "click",
            useMyLocation
        );
    }

    const backTop = $("backTop");

    if (backTop) {
        backTop.addEventListener("click", () => {
            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        });
    }

    currentLocation = { ...DEFAULT_LOCATION };

    setText(
        "placeName",
        "Mumbai (default location)"
    );

    loadData();

    /* Refresh every 15 minutes */

    setInterval(
        loadData,
        15 * 60 * 1000
    );

=======
const API_URL = "/api/data";

const DEFAULT_LOCATION = {
    lat: 19.0760,
    lon: 72.8777,
    name: "Mumbai"
};

const $ = id => document.getElementById(id);

let currentLocation = { ...DEFAULT_LOCATION };

/* =========================
   BASIC FUNCTIONS
========================= */

function setText(id, value) {
    const element = $(id);

    if (element && value !== undefined && value !== null) {
        element.textContent = value;
    }
}

function getValue(object, ...keys) {
    for (const key of keys) {
        if (object && object[key] !== undefined && object[key] !== null) {
            return object[key];
        }
    }

    return null;
}

function formatNumber(value, digits = 1) {
    const number = Number(value);

    return Number.isFinite(number)
        ? Number(number.toFixed(digits)).toString()
        : "--";
}

function setGreeting() {
    const now = new Date();
    const hour = now.getHours();

    let greeting;

    if (hour < 12) {
        greeting = "Good morning!";
    } else if (hour < 17) {
        greeting = "Good afternoon!";
    } else {
        greeting = "Good evening!";
    }

    setText("greeting", greeting);

    setText(
        "dateText",
        now.toLocaleDateString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
        })
    );
}

/* =========================
   AIR QUALITY LEVELS
========================= */

function getAQILevel(aqi) {

    if (aqi <= 50) {
        return {
            key: "good",
            label: "Good",
            color: "#36a873",

            headline: "The air is looking fresh!",

            advice:
                "It is a good time to enjoy outdoor activities.",

            alert:
                "A good-air day",

            message:
                "Air quality is satisfactory. Enjoy the outdoors while continuing clean-air habits.",

            tips: [
                "Enjoy outdoor walks and activities.",
                "Keep choosing greener ways to travel.",
                "Check again later for updated conditions."
            ]
        };
    }

    if (aqi <= 100) {
        return {
            key: "moderate",
            label: "Moderate",
            color: "#d7a33b",

            headline: "Air quality is acceptable.",

            advice:
                "Sensitive people may prefer lighter outdoor activity.",

            alert:
                "A little care goes a long way",

            message:
                "Air quality is acceptable, but unusually sensitive people may experience some discomfort.",

            tips: [
                "Sensitive people should consider shorter outdoor activity.",
                "Avoid unnecessary vehicle idling.",
                "Check the hourly trend before longer outdoor plans."
            ]
        };
    }

    if (aqi <= 200) {
        return {
            key: "bad",
            label: "Poor",
            color: "#e58b45",

            headline: "Take care when spending time outside.",

            advice:
                "Reduce prolonged or heavy outdoor exertion.",

            alert:
                "Consider reducing outdoor exertion",

            message:
                "Poorer air quality can affect sensitive groups. Reduce prolonged outdoor exertion.",

            tips: [
                "Limit long or intense outdoor exercise.",
                "Keep windows closed when outdoor air is poor.",
                "Follow local health advisories if symptoms occur."
            ]
        };
    }

    return {
        key: "worse",
        label: "Very Poor",
        color: "#d75c58",

        headline: "Protect yourself from polluted air.",

        advice:
            "Avoid strenuous outdoor activity and follow local advisories.",

        alert:
            "High pollution — take precautions",

        message:
            "Very poor air quality may affect health. Avoid strenuous outdoor activity and follow local guidance.",

        tips: [
            "Avoid outdoor exercise where possible.",
            "Use a well-fitted protective mask if going outside.",
            "Follow local pollution and health advisories."
        ]
    };
}

/* =========================
   CHANGE CHARACTER IMAGES
========================= */

function updateCharacters(aqi) {

    const image = $("aqiCharacters");

    if (!image || !Number.isFinite(Number(aqi))) {
        return;
    }

    const level = getAQILevel(Number(aqi));

    const imagePath =
        `/static/images/${level.key}.png`;

    if (!image.src.endsWith(imagePath)) {
        image.src = imagePath;
    }

    image.alt =
        `VayuMitra characters showing ${level.label} air quality`;
}

/* =========================
   UPDATE AQI
========================= */

function updateAQI(air) {

    const aqi = Number(
        getValue(air, "us_aqi", "aqi", "usAqi", "AQI")
    );

    if (!Number.isFinite(aqi)) {

        setText("aqiValue", "--");
        setText("aqiStatus", "Unavailable");

        setText(
            "aqiHeadline",
            "Air quality data is unavailable"
        );

        setText(
            "aqiAdvice",
            "Please try refreshing the live data."
        );

        return null;
    }

    const level = getAQILevel(aqi);

    setText("aqiValue", Math.round(aqi));
    setText("aqiStatus", level.label);

    setText("aqiHeadline", level.headline);
    setText("aqiAdvice", level.advice);

    /* Change AQI gauge */

    const gauge = document.querySelector(".gauge");

    if (gauge) {

        const percent = Math.max(
            2,
            Math.min(100, aqi / 300 * 100)
        );

        gauge.style.background =
            `conic-gradient(
                ${level.color} 0 ${percent}%,
                #d9eee1 ${percent}% 100%
            )`;
    }

    /* Change both characters */

    updateCharacters(aqi);

    /* Update alerts */

    setText("alertTitle", level.alert);
    setText("alertMessage", level.message);

    setText("tipOne", level.tips[0]);
    setText("tipTwo", level.tips[1]);
    setText("tipThree", level.tips[2]);

    setText("trendCurrent", Math.round(aqi));

    return aqi;
}

/* =========================
   WEATHER
========================= */

function updateWeather(weather) {

    const temp = getValue(
        weather,
        "temperature_2m",
        "temperature",
        "temp"
    );

    const feels = getValue(
        weather,
        "apparent_temperature",
        "feels_like",
        "feelsLike"
    );

    const humidity = getValue(
        weather,
        "relative_humidity_2m",
        "humidity"
    );

    const wind = getValue(
        weather,
        "wind_speed_10m",
        "wind_speed",
        "wind"
    );

    const code = Number(
        getValue(
            weather,
            "weather_code",
            "weathercode",
            "code"
        )
    );

    setText(
        "temperature",
        temp === null ? "--°C" : `${formatNumber(temp, 0)}°C`
    );

    setText(
        "feelsLike",
        feels === null ? "--°C" : `${formatNumber(feels, 0)}°C`
    );

    setText(
        "humidity",
        humidity === null ? "--%" : `${formatNumber(humidity, 0)}%`
    );

    setText(
        "wind",
        wind === null ? "-- km/h" : `${formatNumber(wind, 1)} km/h`
    );

    const descriptions = {
        0: ["☀️", "Clear sky"],
        1: ["🌤️", "Mainly clear"],
        2: ["⛅", "Partly cloudy"],
        3: ["☁️", "Overcast"],
        45: ["🌫️", "Fog"],
        48: ["🌫️", "Depositing rime fog"],
        51: ["🌦️", "Light drizzle"],
        53: ["🌦️", "Drizzle"],
        55: ["🌧️", "Dense drizzle"],
        61: ["🌦️", "Light rain"],
        63: ["🌧️", "Rain"],
        65: ["🌧️", "Heavy rain"],
        71: ["🌨️", "Light snow"],
        73: ["🌨️", "Snow"],
        75: ["❄️", "Heavy snow"],
        80: ["🌦️", "Rain showers"],
        81: ["🌧️", "Rain showers"],
        82: ["⛈️", "Heavy rain showers"],
        95: ["⛈️", "Thunderstorm"]
    };

    const description =
        descriptions[code] || ["⛅", "Current conditions"];

    setText("weatherIcon", description[0]);
    setText("weatherText", description[1]);

    const time = getValue(
        weather,
        "time",
        "current_time",
        "updated_at"
    );

    setText(
        "weatherTime",
        time
            ? `Latest weather update: ${String(time).replace("T", " ")}`
            : "Latest available weather conditions"
    );
}

/* =========================
   POLLUTANTS
========================= */

function setBar(id, value, maxValue) {

    const element = $(id);

    if (!element) return;

    const number = Number(value);

    if (!Number.isFinite(number)) {
        element.style.width = "0%";
        return;
    }

    const percentage = Math.max(
        0,
        Math.min(100, number / maxValue * 100)
    );

    element.style.width = percentage + "%";
}

function updatePollutants(air) {

    const pollutants = [
        {
            id: "pm25",
            bar: "barPm25",
            keys: ["pm2_5", "pm25", "pm2.5"],
            max: 100
        },
        {
            id: "pm10",
            bar: "barPm10",
            keys: ["pm10"],
            max: 150
        },
        {
            id: "no2",
            bar: "barNo2",
            keys: ["nitrogen_dioxide", "no2"],
            max: 200
        },
        {
            id: "co",
            bar: "barCo",
            keys: ["carbon_monoxide", "co"],
            max: 10000
        },
        {
            id: "o3",
            bar: "barO3",
            keys: ["ozone", "o3"],
            max: 200
        },
        {
            id: "so2",
            bar: "barSo2",
            keys: ["sulphur_dioxide", "sulfur_dioxide", "so2"],
            max: 200
        }
    ];

    pollutants.forEach(item => {

        const value = getValue(
            air,
            ...item.keys
        );

        setText(
            item.id,
            formatNumber(value, 1)
        );

        setBar(
            item.bar,
            value,
            item.max
        );

    });
}

/* =========================
   AQI TREND GRAPH
========================= */

function renderTrend(data, air) {

    const svg = $("trendChart");

    if (!svg) return;

    const hourly =
        air.hourly ||
        data.hourly ||
        (data.forecast && data.forecast.hourly) ||
        {};

    const values =
        hourly.us_aqi ||
        hourly.aqi ||
        air.hourly_aqi ||
        data.hourly_aqi;

    const times =
        hourly.time ||
        data.hourly_time ||
        [];

    if (!Array.isArray(values) || !values.length) {

        svg.innerHTML = `
            <text x="450" y="140"
                text-anchor="middle"
                fill="#55718a">
                Hourly forecast is not available.
            </text>
        `;

        return;
    }

    const numbers = values
        .map(Number)
        .filter(Number.isFinite)
        .slice(0, 24);

    if (!numbers.length) return;

    const min = Math.min(...numbers);
    const max = Math.max(...numbers);

    const low = Math.min(0, min - 10);
    const high = Math.max(100, max + 10);

    const points = numbers.map((value, index) => {

        const x =
            35 + index * 830 / Math.max(1, numbers.length - 1);

        const y =
            225 - ((value - low) / (high - low || 1)) * 180;

        return [x, y];
    });

    const line = points
        .map(point => point.join(","))
        .join(" ");

    const area =
        `35,235 ${line} ${points[points.length - 1][0]},235`;

    const labels = points
        .filter((point, index) => index % 4 === 0)
        .map(point => {

            const index = points.indexOf(point);

            const label = times[index]
                ? String(times[index]).slice(11, 16)
                : `${index}:00`;

            return `
                <text x="${point[0]}" y="265"
                    text-anchor="middle"
                    font-size="12"
                    fill="#78918a">
                    ${label}
                </text>
            `;
        })
        .join("");

    svg.innerHTML = `

        <defs>
            <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%"
                    stop-color="#52b987"
                    stop-opacity=".28"/>

                <stop offset="100%"
                    stop-color="#52b987"
                    stop-opacity=".02"/>
            </linearGradient>
        </defs>

        <line x1="35" y1="55" x2="865" y2="55"
            stroke="#dcebe2"
            stroke-dasharray="5 7"/>

        <line x1="35" y1="145" x2="865" y2="145"
            stroke="#dcebe2"
            stroke-dasharray="5 7"/>

        <line x1="35" y1="235" x2="865" y2="235"
            stroke="#dcebe2"/>

        <polygon points="${area}"
            fill="url(#trendFill)"/>

        <polyline points="${line}"
            fill="none"
            stroke="#299568"
            stroke-width="4"
            stroke-linecap="round"
            stroke-linejoin="round"/>

        ${points.map(point => `
            <circle cx="${point[0]}"
                cy="${point[1]}"
                r="4"
                fill="#fff"
                stroke="#299568"
                stroke-width="3"/>
        `).join("")}

        ${labels}
    `;

    setText("trendHigh", Math.round(max));
    setText("trendLow", Math.round(min));
}

/* =========================
   LOAD LIVE DATA
========================= */

async function loadData() {

    setText("updateStatus", "Updating live data...");

    try {

        const url =
            `${API_URL}?lat=${encodeURIComponent(currentLocation.lat)}&lon=${encodeURIComponent(currentLocation.lon)}`;

        const response = await fetch(url, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }

        const data = await response.json();

        const air =
            data.air_quality ||
            data.airQuality ||
            data.air ||
            data;

        const weather =
            data.weather ||
            data.weather_data ||
            data.weatherData ||
            data;

        const locationName =
            data.location_name ||
            data.city ||
            currentLocation.name;

        setText(
            "placeName",
            typeof locationName === "string"
                ? locationName
                : currentLocation.name
        );

        /* Update all dashboard sections */

        updateAQI(air);

        updateWeather(weather);

        updatePollutants(air);

        renderTrend(data, air);

        setText(
            "updateStatus",
            `Live • ${new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
            })}`
        );

    } catch (error) {

        console.error("VayuMitra data error:", error);

        setText("updateStatus", "Live data unavailable");

        setText("aqiStatus", "Unavailable");

        setText(
            "aqiHeadline",
            "Unable to load live air quality"
        );

        setText(
            "aqiAdvice",
            "Check your connection and try again."
        );

        setText(
            "weatherText",
            "Weather data unavailable"
        );
    }
}

/* =========================
   LOCATION
========================= */

function useMyLocation() {

    if (!navigator.geolocation) {

        currentLocation = { ...DEFAULT_LOCATION };

        setText("placeName", "Mumbai (default location)");

        loadData();

        return;
    }

    setText("placeName", "Finding your location...");

    navigator.geolocation.getCurrentPosition(

        position => {

            currentLocation = {
                lat: position.coords.latitude,
                lon: position.coords.longitude,
                name: "Your location"
            };

            setText(
                "placeName",
                "Your current location"
            );

            loadData();
        },

        () => {

            currentLocation = { ...DEFAULT_LOCATION };

            setText(
                "placeName",
                "Mumbai (default location)"
            );

            loadData();
        },

        {
            enableHighAccuracy: false,
            timeout: 10000,
            maximumAge: 300000
        }
    );
}

/* =========================
   START DASHBOARD
========================= */

document.addEventListener("DOMContentLoaded", () => {

    setGreeting();

    const locateButton = $("locateBtn");

    if (locateButton) {
        locateButton.addEventListener(
            "click",
            useMyLocation
        );
    }

    const backTop = $("backTop");

    if (backTop) {
        backTop.addEventListener("click", () => {
            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        });
    }

    currentLocation = { ...DEFAULT_LOCATION };

    setText(
        "placeName",
        "Mumbai (default location)"
    );

    loadData();

    /* Refresh every 15 minutes */

    setInterval(
        loadData,
        15 * 60 * 1000
    );

>>>>>>> 4c50d794d59387d7b19db37e5d629d0ac6def7c8
});