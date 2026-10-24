output "user_name" {
  value = aws_iam_user.dashboard.name
}

output "policy_arn" {
  value = aws_iam_policy.reboot.arn
}
