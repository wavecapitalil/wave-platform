"""CFTC Commitments of Traders compressed-report provider."""

import io
import zipfile

import pandas as pd
import requests

DISAGG_ZIP = "https://www.cftc.gov/files/dea/history/fut_disagg_txt_{year}.zip"
FIN_ZIP = "https://www.cftc.gov/files/dea/history/fut_fin_txt_{year}.zip"

_CACHE = {}


def get_annual_frame(report_type, year, *, timeout=25):
    key = (report_type, int(year))
    if key in _CACHE:
        return _CACHE[key].copy()

    template = FIN_ZIP if report_type == "financial" else DISAGG_ZIP
    response = requests.get(
        template.format(year=year),
        timeout=timeout,
        headers={"User-Agent": "WaveCapital research@wavecapital.com"},
    )
    response.raise_for_status()

    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        names = [
            name
            for name in archive.namelist()
            if name.lower().endswith((".txt", ".csv"))
        ]
        if not names:
            raise ValueError("CFTC archive contains no text report")
        with archive.open(names[0]) as file_obj:
            frame = pd.read_csv(file_obj, low_memory=False)

    _CACHE[key] = frame
    return frame.copy()
