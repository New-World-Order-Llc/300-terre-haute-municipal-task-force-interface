from adapters.municipal_adapter import municipal_format
from adapters.nwo_dao_adapter import dao_format
from adapters.nwo_llc_adapter import llc_format
from core.audit import log_event
from core.intake import intake
from core.routing import route_to_municipal
from core.status import status_report
from core.validation import validate_payload


def run_pipeline(payload):
    """Run the integration pipeline. This module is an integration layer only
    and does not act with municipal authority."""
    intake_result = intake(payload)
    log_event("intake", intake_result)

    validation_result = validate_payload(intake_result["payload"])
    log_event("validation", validation_result)

    if not validation_result["valid"]:
        return {"intake": intake_result, "validation": validation_result}

    validated = validation_result["payload"]
    dao_ready = dao_format(validated)
    llc_ready = llc_format(validated)
    municipal_ready = municipal_format(validated)

    routing_result = route_to_municipal(municipal_ready)
    log_event("routing", routing_result)

    status = status_report(validated["case_id"])
    log_event("status", status)

    return {
        "intake": intake_result,
        "validation": validation_result,
        "dao": dao_ready,
        "llc": llc_ready,
        "municipal": municipal_ready,
        "routing": routing_result,
        "status": status,
    }
