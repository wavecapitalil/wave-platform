# comm_flows.py — placeholder/stub module
# The original comm_flows module (Digital Ad Intelligence / EDGAR) was missing
# from this folder, which crashed api.py at startup. This stub lets the whole
# server boot normally; only the "Comm Flows" panel will show empty data.
# If you locate the real comm_flows.py, just replace this file and re-run the
# installer (or copy it into ~/wave-server) to restore that feature.

def init_db(*args, **kwargs):
    return None

def get_latest_quarter(*args, **kwargs):
    return {}

def get_history(*args, **kwargs):
    return {}

def get_regional_breakdown(*args, **kwargs):
    return {}

def detect_trends(*args, **kwargs):
    return []

def check_and_update(*args, **kwargs):
    return []

def get_update_status(*args, **kwargs):
    return []