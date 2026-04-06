import importlib

# later import azure, gcp


def validate_credentials(provider, credentials):
    if not isinstance(credentials, dict):
        return False, "Credentials must be a dictionary."

    try:
        module_name = f"accounts.services.validators.{provider.lower()}_validator"
        module = importlib.import_module(module_name)
        validator_func = getattr(module, "validate_credentials")
        return validator_func(credentials)

    except ModuleNotFoundError:
        return False, "Validator not found for provider"

    except AttributeError:
        return False, "Validation function missing"

    except Exception as e:
        return False, str(e)
