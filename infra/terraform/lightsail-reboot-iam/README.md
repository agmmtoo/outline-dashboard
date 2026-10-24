# Lightsail reboot IAM

Creates an IAM user that can **only**:

- `lightsail:RebootInstance` on instances tagged `outline-dashboard=reboot` in the given regions
- `lightsail:GetInstanceState` in the given regions (this action has no resource-level permissions)

```bash
terraform init
terraform apply -var='regions=["ap-southeast-1"]'
```

Run it in the AWS account that owns the Lightsail instances. With several accounts, apply it once per account and use one dashboard credential per account (the dashboard currently reads a single key pair).

## Tag the instances you want to be rebootable

```bash
aws lightsail tag-resource --region ap-southeast-1 \
  --resource-name <instance-name> --tags key=outline-dashboard,value=reboot
```

Untagged instances get `AccessDenied`, even if they are listed in `OUTLINE_SERVERS`.

## Create the access key and hand it straight to the Worker

The key is created outside Terraform so the secret never sits in Terraform state. Don't paste it into chat, tickets or `wrangler.jsonc`.

```bash
aws iam create-access-key --user-name outline-dashboard-reboot
cd ../../../apps/api
npx wrangler secret put AWS_ACCESS_KEY_ID
npx wrangler secret put AWS_SECRET_ACCESS_KEY
```

Rotate every 90 days: create a second key, update both secrets, then delete the old key with `aws iam delete-access-key`.
