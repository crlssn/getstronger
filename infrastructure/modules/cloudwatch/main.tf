resource "aws_cloudwatch_log_group" "log_group" {
  name              = var.log_group_name
  retention_in_days = var.retention_days
}

resource "aws_iam_role" "role" {
  name               = var.role_name
  assume_role_policy = var.assume_role_policy
}

resource "aws_iam_policy" "log_policy" {
  name        = var.policy_name
  description = "Policy for pushing logs to CloudWatch"

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect   = "Allow",
        Action   = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ],
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "policy_attachment" {
  role       = aws_iam_role.role.name
  policy_arn = aws_iam_policy.log_policy.arn
}

resource "aws_iam_instance_profile" "instance_profile" {
  name = var.instance_profile_name
  role = aws_iam_role.role.name
}

output "instance_profile_name" {
  value = aws_iam_instance_profile.instance_profile.name
}
