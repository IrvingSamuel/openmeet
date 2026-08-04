name: Pull request
title: ""
labels: []
body:
  - type: markdown
    attributes:
      value: |
        Target **`dev`** for features. Hotfixes may target `main` when agreed with maintainers.
  - type: checkboxes
    id: checklist
    attributes:
      label: Checklist
      options:
        - label: I ran `npm run verify`
          required: true
        - label: I updated translations in all five `messages/*.json` files when UI copy changed
          required: false
        - label: This PR does not include secrets (`.env`, keys, tokens)
          required: true
  - type: textarea
    id: summary
    attributes:
      label: Summary
      description: What does this change and why?
    validations:
      required: true
