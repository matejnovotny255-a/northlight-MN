/* Site settings. Edit the values here; pages read them from window.NorthlightConfig.
   Plain values only: nothing secret belongs in this file because it is public. */
window.NorthlightConfig = {
  siteName: 'Northlight Studio',
  locale: 'en-GB',                       // number and date formatting
  currency: 'EUR',                       // used for CRM amounts
  alertRecipient: 'oncall@example.com',  // default address for automation alerts (simulated, never sent)
  healthUrl: 'health.json',              // name, version and build date of the deployed site
  exportFilePrefix: 'northlight-export'  // file name used by "Export all data"
};
