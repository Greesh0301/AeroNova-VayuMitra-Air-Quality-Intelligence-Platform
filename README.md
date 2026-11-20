# VayuMitra

VayuMitra is a multi-page air-quality monitoring website built with HTML, CSS,
JavaScript, Python (Flask) and SQLite.

## Project structure

- `frontend/` — HTML pages, CSS, JavaScript and required images
- `backend/` — Python server, configuration and API/data services
- `backend/requirements.txt` — Python dependencies
- `database/` — created automatically when the server starts

## Run on Windows (VS Code)

1. Extract `VayuMitra_Cleaned.zip`.
2. Open the extracted **VayuMitra** folder in VS Code.
3. Open Terminal → New Terminal.
4. Check Python is installed:

   ```powershell
   python --version
   ```

5. Create a virtual environment:

   ```powershell
   python -m venv venv
   ```

6. Activate it in PowerShell:

   ```powershell
   .\venv\Scripts\Activate.ps1
   ```

   If PowerShell blocks activation, use Command Prompt terminal and run:

   ```cmd
   venv\Scripts\activate.bat
   ```

7. Install the required packages:

   ```powershell
   pip install -r backend\requirements.txt
   ```

8. Start the website:

   ```powershell
   python backend\app.py
   ```

9. Open this address in your browser:

   `http://127.0.0.1:5000`

## If Flask installation is unavailable

The project also contains a built-in Python server mode:

```powershell
python backend\app.py --stdlib
```

Then open `http://127.0.0.1:5000`.

## Important

- Do not open the HTML files directly; run the Python server so the `/api/` features work.
- The database and upload folders are created automatically.
- Live air-quality, weather, geocoding and route information needs an internet connection.
- Optional API keys can be added as environment variables; the core Open-Meteo/OSRM services do not require keys.
