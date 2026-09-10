Subject: Re: Let’s Get Quoted messaging templates and test campaign

Hi SignalWire Support,

Thanks for flagging these examples. I found matching code paths that used the workspace name in shared-number replies and inserted structured call-summary data into SMS bodies.

I have prepared and locally tested changes so messages on our Let’s Get Quoted account and dispatch campaigns identify Let’s Get Quoted as the sender, with workspace names used as context. The changes also format call summaries as readable text and hold older unbranded queued messages for review. Deployment and production verification are still pending.

The call-answered notification was intended for the contractor account holder’s alert mobile, rather than the end customer. I understand that you have nonetheless identified its content as outside the current Account & Support registration. The prepared fix holds ordinary and emergency call-alert SMS on that campaign. Please confirm the appropriate campaign or description for these owner-facing notifications before we enable them again.

For the new test campaign, we’ll use Low Volume Mixed with Customer Care and Account Notification, as recommended. We’ll restrict it to company-controlled test devices and retain each number, owner, consent date, and exact agreed disclosure, together with the written consent evidence.

Can one test campaign cover both workspaces under the Let’s Get Quoted brand? Please also confirm whether any provider-managed STOP, START, or HELP response settings need updating separately from our application templates.

Once the fixes are deployed and verified, I’ll submit the test campaign through the dashboard.

Thanks,
Brett
