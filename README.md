# VayuMitra

VayuMitra is an air-quality monitoring website made with HTML, CSS, JavaScript,
Python and SQLite.

## Project folders

- `frontend/` - website pages, styles, scripts and images
- `backend/` - Python application, configuration and data services
- `database/` - the database is created automatically when the server starts

## Run the project in VS Code (Windows)

1. Extract `VayuMitra_Cleaned_v2.zip`.
2. Open the extracted `VayuMitra` folder in VS Code.
3. Open **Terminal > New Terminal**.
4. Check Python:

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

   If PowerShell blocks activation, choose **Command Prompt** as the VS Code
   terminal and run:

   ```cmd
   venv\Scripts\activate.bat
   ```

7. Install the packages:

   ```powershell
   pip install -r backend\requirements.txt
   ```

8. Start VayuMitra:

   ```powershell
   python backend\app.py
   ```

9. Open this address in Chrome:

   `http://127.0.0.1:5000`

## If Flask is not installed

The project includes a built-in Python server. Run:

```powershell
python backend\app.py --stdlib
```

Then open `http://127.0.0.1:5000`.

## Notes

- Run the Python server; do not open `frontend/index.html` directly.
- The SQLite database and upload folder are created automatically.
- Live air-quality, weather and map/routing data need an internet connection.
- The default Open-Meteo and OSRM services do not need API keys.
