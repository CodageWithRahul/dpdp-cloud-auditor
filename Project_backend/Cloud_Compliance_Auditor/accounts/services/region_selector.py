import importlib

# later import azure, gcp


def get_regions(provider, credentials):
    if not isinstance(credentials, dict):
        return None, "Credentials must be a dictionary."

    try:
        module_name = f"accounts.services.regions.{provider.lower()}_region"
        module = importlib.import_module(module_name)
        validator_func = getattr(module, "get_regions")
        return validator_func(credentials)

    except ModuleNotFoundError:
        return None, "Region not found for provider"

    except AttributeError:
        return None, "Region function missing"

    except Exception as e:
        return None, str(e)
