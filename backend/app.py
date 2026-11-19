<<<<<<< HEAD

from flask import Flask, render_template, request, jsonify
import requests

app = Flask(
    __name__,
    template_folder="frontend",
    static_folder="frontend"
)

TIMEOUT = 18


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/api/data")
def live_data():

    try:
        lat = float(request.args.get("lat", "19.0760"))
        lon = float(request.args.get("lon", "72.8777"))

        # Air Quality API
        air_url = "https://air-quality-api.open-meteo.com/v1/air-quality"

        air_params = {
            "latitude": lat,
            "longitude": lon,
            "timezone": "auto",
            "current": (
                "us_aqi,pm2_5,pm10,nitrogen_dioxide,"
                "carbon_monoxide,ozone,sulphur_dioxide"
            ),
            "hourly": (
                "us_aqi,pm2_5,pm10,nitrogen_dioxide,"
                "carbon_monoxide,ozone"
            ),
            "forecast_days": 2
        }

        # Weather API
        weather_url = "https://api.open-meteo.com/v1/forecast"

        weather_params = {
            "latitude": lat,
            "longitude": lon,
            "timezone": "auto",
            "current": (
                "temperature_2m,relative_humidity_2m,"
                "apparent_temperature,precipitation,"
                "weather_code,wind_speed_10m"
            ),
            "forecast_days": 1
        }

        # Fetch live data
        air_response = requests.get(
            air_url,
            params=air_params,
            timeout=TIMEOUT
        )

        weather_response = requests.get(
            weather_url,
            params=weather_params,
            timeout=TIMEOUT
        )

        air_response.raise_for_status()
        weather_response.raise_for_status()

        air_data = air_response.json()
        weather_data = weather_response.json()

        return jsonify({
            "air": air_data,
            "weather": weather_data,
            "location": {
                "latitude": lat,
                "longitude": lon
            },
            "source": "Open-Meteo"
        })

    except (ValueError, requests.RequestException) as error:

        return jsonify({
            "error": "Unable to fetch live data.",
            "detail": str(error)
        }), 502


if __name__ == "__main__":
    app.run(debug=True)
=======

from flask import Flask, render_template, request, jsonify
import requests

app = Flask(
    __name__,
    template_folder="frontend",
    static_folder="frontend"
)

TIMEOUT = 18


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/api/data")
def live_data():

    try:
        lat = float(request.args.get("lat", "19.0760"))
        lon = float(request.args.get("lon", "72.8777"))

        # Air Quality API
        air_url = "https://air-quality-api.open-meteo.com/v1/air-quality"

        air_params = {
            "latitude": lat,
            "longitude": lon,
            "timezone": "auto",
            "current": (
                "us_aqi,pm2_5,pm10,nitrogen_dioxide,"
                "carbon_monoxide,ozone,sulphur_dioxide"
            ),
            "hourly": (
                "us_aqi,pm2_5,pm10,nitrogen_dioxide,"
                "carbon_monoxide,ozone"
            ),
            "forecast_days": 2
        }

        # Weather API
        weather_url = "https://api.open-meteo.com/v1/forecast"

        weather_params = {
            "latitude": lat,
            "longitude": lon,
            "timezone": "auto",
            "current": (
                "temperature_2m,relative_humidity_2m,"
                "apparent_temperature,precipitation,"
                "weather_code,wind_speed_10m"
            ),
            "forecast_days": 1
        }

        # Fetch live data
        air_response = requests.get(
            air_url,
            params=air_params,
            timeout=TIMEOUT
        )

        weather_response = requests.get(
            weather_url,
            params=weather_params,
            timeout=TIMEOUT
        )

        air_response.raise_for_status()
        weather_response.raise_for_status()

        air_data = air_response.json()
        weather_data = weather_response.json()

        return jsonify({
            "air": air_data,
            "weather": weather_data,
            "location": {
                "latitude": lat,
                "longitude": lon
            },
            "source": "Open-Meteo"
        })

    except (ValueError, requests.RequestException) as error:

        return jsonify({
            "error": "Unable to fetch live data.",
            "detail": str(error)
        }), 502


if __name__ == "__main__":
    app.run(debug=True)
>>>>>>> 4c50d794d59387d7b19db37e5d629d0ac6def7c8
