# Feature Blocked Modal Specification

## Purpose

Consistent blocking modal for feature-not-enabled, plan-blocked, and overdue-payment states.

## Requirements

### Requirement: R1 — Blocked feature shows blocking modal

When a feature is disabled by plan restrictions or overdue payment, the system MUST display a blocking modal instead of a toast notification. The modal SHALL show: feature name, current plan, and WhatsApp contact button.

#### Scenario: J — Feature disabled shows modal

- GIVEN a user on a plan that does not include the requested feature
- WHEN the user triggers that feature
- THEN a blocking modal appears with feature name, current plan, and WhatsApp contact
- AND the action is prevented

#### Scenario: K — Feature enabled proceeds normally

- GIVEN a user on a plan that includes the requested feature
- WHEN the user triggers that feature
- THEN no blocking modal appears
- AND the action executes normally
