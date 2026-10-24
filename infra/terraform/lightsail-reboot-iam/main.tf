# Least-privilege identity for the Outline dashboard's "Reboot instance" button.
# It can reboot only instances tagged <tag_key>=<tag_value>, read instance state,
# and nothing else. The access key is created outside Terraform so the secret
# never lands in Terraform state (see README.md).

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

data "aws_iam_policy_document" "reboot" {
  statement {
    sid       = "RebootTaggedInstances"
    effect    = "Allow"
    actions   = ["lightsail:RebootInstance"]
    resources = [for r in var.regions : "arn:${data.aws_partition.current.partition}:lightsail:${r}:${data.aws_caller_identity.current.account_id}:Instance/*"]

    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/${var.tag_key}"
      values   = [var.tag_value]
    }
  }

  # GetInstanceState does not support resource-level permissions, so it needs "*".
  # It is read-only and limited to the configured regions.
  statement {
    sid       = "ReadInstanceState"
    effect    = "Allow"
    actions   = ["lightsail:GetInstanceState"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "aws:RequestedRegion"
      values   = var.regions
    }
  }
}

resource "aws_iam_policy" "reboot" {
  name        = "${var.user_name}-policy"
  description = "Outline dashboard: reboot tagged Lightsail instances and read their state"
  policy      = data.aws_iam_policy_document.reboot.json
}

resource "aws_iam_user" "dashboard" {
  name = var.user_name
  path = "/service/"

  tags = {
    purpose = "outline-dashboard-reboot"
  }
}

resource "aws_iam_user_policy_attachment" "reboot" {
  user       = aws_iam_user.dashboard.name
  policy_arn = aws_iam_policy.reboot.arn
}
