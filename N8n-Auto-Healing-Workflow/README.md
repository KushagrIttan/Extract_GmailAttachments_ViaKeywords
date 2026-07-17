# Auto-Healing Alert Mechanism for n8n

## Overview
This workflow demonstrates an "Auto-Healing" approach to production API failures in n8n. Instead of allowing a workflow to silently crash when an API request fails, this design catches the failure in two ways:
1. **Local Error Handling:** The HTTP Request node is configured to "Continue On Fail". An IF node then inspects the HTTP response and gracefully routes errors to an extraction and formatting pipeline.
2. **Global Error Catching:** An `Error Trigger` node acts as a safety net, capturing any unhandled execution errors anywhere in the workflow and piping them to the exact same alert mechanism.

This ensures your systems are self-monitoring and operations teams are immediately notified with clear, actionable data.

## Setup & Import Instructions

1. **Import the Workflow**
   - Open your n8n workspace and navigate to the Workflows canvas.
   - Click the **Options menu** (the `...` or gear icon in the top right).
   - Select **Import from File** and upload the `auto-healing-alert-workflow.json` file in this directory.

2. **Configure the Credentials**
   - **Discord:** Double-click the `Send Discord Alert` node. Replace `YOUR_DISCORD_WEBHOOK_URL_HERE` with your actual Discord channel Webhook URL. (You can generate one in Discord: Channel Settings -> Integrations -> Webhooks -> New Webhook).
   - **Email:** Double-click the `Send Email Alert` node. Under **Credentials**, attach your SMTP account (e.g., a Gmail App Password). Replace `YOUR_SENDER_EMAIL_HERE` and `YOUR_RECEIVER_EMAIL_HERE` with your real email addresses. 
   - *Note:* If you are only demonstrating one method, you can disable the node you aren't using by selecting it and pressing `D` to prevent credential errors.

3. **Run a Manual Test**
   - Click the **Execute Workflow** button (or the "play" button on the `Start Test` trigger node).
   - The workflow will intentionally call a broken endpoint (`https://httpstat.us/404`) and trigger the automated alerting pipeline.

## Testing Evidence

*(Place your screenshots and screen recordings below for the internship submission)*

- **[Screenshot Placeholder: n8n Workflow Execution Canvas]**
- **[Screenshot Placeholder: Discord / Email Alert Received]**

---
**Credits:** Built using n8n + Antigravity
