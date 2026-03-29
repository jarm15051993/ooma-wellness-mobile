---
name: Always use feature branches
description: Never commit directly to main, even for hotfixes or urgent security patches
type: feedback
---

Always create a new branch before making any code changes, regardless of urgency.

**Why:** User explicitly requested this after a security hotfix was pushed directly to main.

**How to apply:** Before writing a single line of code, run `git checkout -b <branch-name>`. Use descriptive names like `fix/security-hardening` or `hotfix/rate-limiting`. Only push to main after the user approves or explicitly asks to merge.
