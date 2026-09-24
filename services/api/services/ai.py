"""Shared AI provider adapter.

Route modules should not know provider HTTP schemas or how credentials are
loaded. This service keeps provider selection and model fallback in one place.
"""

import os
import requests


def load_ai_config():
    config = {}
    for key in ("ANTHROPIC_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_MODEL", "OPENAI_MODEL"):
        value = os.environ.get(key)
        if value:
            config[key] = value
    return config


def call_anthropic(key, model, prompt, *, max_tokens=2600, timeout=45):
    candidates = [
        item
        for item in (
            model,
            "claude-haiku-4-5-20251001",
            "claude-3-5-haiku-latest",
            "claude-sonnet-4-6",
            "claude-3-5-sonnet-latest",
        )
        if item
    ]

    seen = set()
    last_response = None
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        response = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": candidate,
                "max_tokens": max_tokens,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=timeout,
        )
        last_response = response
        if response.status_code == 404:
            continue
        response.raise_for_status()
        payload = response.json()
        return "".join(part.get("text", "") for part in payload.get("content", []))

    if last_response is None:
        raise RuntimeError("no Anthropic model candidate configured")
    last_response.raise_for_status()
    payload = last_response.json()
    return "".join(part.get("text", "") for part in payload.get("content", []))


def call_openai(key, model, prompt, *, max_tokens=2600, timeout=45):
    response = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": "Bearer " + key,
            "content-type": "application/json",
        },
        json={
            "model": model or "gpt-4o-mini",
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        },
        timeout=timeout,
    )
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]


def call_configured_model(prompt, *, max_tokens=2600, timeout=45):
    config = load_ai_config()
    anthropic_key = config.get("ANTHROPIC_API_KEY")
    openai_key = config.get("OPENAI_API_KEY")

    if anthropic_key:
        return call_anthropic(
            anthropic_key,
            config.get("ANTHROPIC_MODEL"),
            prompt,
            max_tokens=max_tokens,
            timeout=timeout,
        )

    if openai_key:
        return call_openai(
            openai_key,
            config.get("OPENAI_MODEL"),
            prompt,
            max_tokens=max_tokens,
            timeout=timeout,
        )

    raise RuntimeError("no AI provider key configured")
