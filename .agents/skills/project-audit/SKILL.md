---
name: project-audit
description: Use only when the user explicitly requests a read-only whole-project audit of safety, reliability, tests, documentation, delivery, and removable complexity.
---

# Project audit

Audit facts before recommendations. Do not edit the project.

1. Establish Git status, technology inventory, entry points, external systems, persistence, tests, and delivery configuration.
2. Separate documented behavior from technically enforced behavior.
3. Inspect safety/reliability, test quality, docs/runability, duplication, and dead or superseded paths.
4. Do not call code dead until entry-point and string-reference searches show it is unreachable. On doubt, keep it.
5. Use current primary sources for material industry claims and open every cited URL.
6. Verify each surviving finding directly in the cited file.

Report at most ten findings ordered by real impact. Include evidence, failure mode, effort, confidence, and how to verify a fix. Keep removal candidates separate with reachability verdict and risk. Name anything that could not be checked.
