SERVICE_SCOPE = {}


def get_global_services():
    return {name for name, scope in SERVICE_SCOPE.items() if scope == "global"}


def get_regional_services():
    return {name for name, scope in SERVICE_SCOPE.items() if scope == "regional"}

