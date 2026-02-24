# GitHub Actions Setup

This repository includes a GitHub Actions workflow that automatically runs the enrichment process on a schedule.

## Required Secrets

To use GitHub Actions, you need to add these secrets to your repository:

1. Go to your repository on GitHub
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** for each of the following:

### Required Secrets

| Secret Name | Description | Example |
|------------|-------------|---------|
| `AIRTABLE_TOKEN` | Your Airtable Personal Access Token | `pat.euc1.xxxxx...` |
| `AIRTABLE_BASE_ID` | Airtable Base ID for Artists table | `appiYGWjEZVB76yyl` |
| `AIRTABLE_TABLE_ID` | Airtable Table ID for Artists | `tblQ3DrCHekgRqj7Z` |
| `ALBUMS_BASE_ID` | Airtable Base ID for Albums table | `appYXhhXgVkSblLdl` |
| `ALBUMS_TABLE_ID` | Airtable Table ID for Albums | `tblYaSMImRbOr9CX3` |
| `AUDIODB_API_KEY` | TheAudioDB API Key (use "2" for testing) | `2` or premium key |

### Optional Secrets

| Secret Name | Description | Default |
|------------|-------------|---------|
| `AIRTABLE_VIEW_NAME` | Airtable view name to filter records | `Musicbrainz` |

## Workflow Details

### Schedule
The workflow runs automatically:
- **Daily at 2 AM UTC** (scheduled via cron)

### Manual Trigger
You can also run it manually:
1. Go to **Actions** tab
2. Select **MusicBrainz Full Enrichment**
3. Click **Run workflow**
4. Optional: Set a LIMIT value to test with fewer records

### What It Does

1. Checks out the code
2. Sets up Node.js 20
3. Installs dependencies
4. Builds TypeScript
5. Runs the enrichment process with your secrets
6. Uploads logs if the workflow fails

## Monitoring

- Check the **Actions** tab to see workflow runs
- Each run shows:
  - ✅ Success: All artists and albums processed
  - ❌ Failure: Check logs for errors
  - Execution time
  - Number of records processed

## Testing

To test the workflow with a limited number of records:
1. Run manually via Actions tab
2. Set `limit` input to a small number (e.g., `5`)
3. Verify results in Airtable before running full enrichment

## Rate Limiting

The workflow respects MusicBrainz API rate limits (1 req/sec), so processing many artists may take time. For 27 artists with multiple albums each, expect the workflow to run for 5-15 minutes.

## Troubleshooting

If the workflow fails:
1. Check the Actions logs for error messages
2. Verify all secrets are set correctly
3. Ensure Airtable base IDs and table IDs are correct
4. Check that required fields exist in your Airtable tables
5. Download the log artifacts for detailed debugging

## Security Notes

- Never commit `.env` file with real credentials
- All sensitive data is stored as GitHub Secrets
- Secrets are encrypted and only accessible during workflow runs
- Use Personal Access Tokens with minimal required scopes
