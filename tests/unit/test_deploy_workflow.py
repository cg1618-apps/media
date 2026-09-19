"""The deploy workflow's invariants.

This file is one decision and nothing else: a push to `main` calls the
platform's reusable pipeline for the app named `media`. The classify step, the
two lanes, the production approval gate and the exit-2-only rollback all live
in `cg1618-apps/platform` and are tested there.

What cannot be tested there is this file. A caller adds its own triggers and
can name its own runner, and the platform can neither see nor fail what an app
repository commits - so the two assertions that matter most below are about
what this workflow must NOT contain.
"""

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "deploy.yml"

PLATFORM_WORKFLOW = "cg1618-apps/platform/.github/workflows/deploy-app.yml@main"


def workflow():
    return yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))


def _triggers(parsed):
    # `on` is parsed by PyYAML as the boolean True - YAML 1.1 treats on/off as
    # booleans - so the key is True, not "on". Reading parsed["on"] here raises
    # a KeyError rather than returning the trigger, which is how a test like
    # this quietly asserts nothing.
    return parsed[True] if True in parsed else parsed["on"]


def test_it_deploys_only_from_main():
    assert _triggers(workflow())["push"]["branches"] == ["main"]


def test_nothing_here_is_triggered_by_a_pull_request():
    # The single most important line in this file. The job below resolves to a
    # self-hosted runner - a machine in a house - and this repository is
    # public, so a pull_request trigger would let a fork's pull request execute
    # on it. The platform's workflow is `workflow_call` only for exactly this
    # reason, and that protects it from being triggered directly; it does
    # nothing about a caller that adds a trigger of its own.
    triggers = _triggers(workflow())
    assert set(triggers) == {"push"}, triggers


def test_the_only_job_calls_the_platform_pipeline_for_this_app():
    # `app:` is the name apps.yml spells, and it is the whole of what this
    # repository tells the pipeline. Everything else the deploy needs - the
    # port, the health path, the database, whether this app has migrations,
    # where its checkout lives - the pipeline reads from the registry.
    jobs = workflow()["jobs"]
    assert list(jobs) == ["deploy"], jobs
    assert jobs["deploy"]["uses"] == PLATFORM_WORKFLOW
    assert jobs["deploy"]["with"] == {"app": "media"}


def test_this_workflow_names_no_runner_and_runs_no_steps_of_its_own():
    # A caller that grows steps has started keeping a second copy of the
    # pipeline, and the copy is the one nothing tests. `runs-on` is worse: the
    # platform's `runs_on` input defaults to the box, and an app that names a
    # runner here is one edit away from naming one a pull request can reach.
    deploy = workflow()["jobs"]["deploy"]
    assert "steps" not in deploy
    assert "runs-on" not in deploy
