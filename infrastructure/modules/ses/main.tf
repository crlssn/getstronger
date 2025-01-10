resource "aws_ses_domain_identity" "ses_domain" {
  domain = var.domain
}

resource "aws_route53_record" "ses_verification" {
  zone_id = var.zone_id
  name    = "_amazonses.${var.domain}"
  type    = "TXT"
  ttl     = 600
  records = [aws_ses_domain_identity.ses_domain.verification_token]
}

resource "aws_ses_domain_dkim" "ses_dkim" {
  domain = aws_ses_domain_identity.ses_domain.domain
}

resource "aws_route53_record" "dkim" {
  for_each = toset(aws_ses_domain_dkim.ses_dkim.dkim_tokens)
  zone_id  = var.zone_id
  name     = "${each.value}._domainkey.${var.domain}"
  type     = "CNAME"
  ttl      = 600
  records  = ["${each.value}.dkim.amazonses.com"]
}

resource "aws_route53_record" "spf" {
  zone_id = var.zone_id
  name    = var.domain
  type    = "TXT"
  ttl     = 600
  records = ["v=spf1 include:amazonses.com ~all"]
}

resource "aws_route53_record" "mx" {
  zone_id = var.zone_id
  name    = var.domain
  type    = "MX"
  ttl     = 300
  records = [
    "10 inbound-smtp.${var.region}.amazonaws.com",
    "10 feedback-smtp.${var.region}.amazonses.com",
  ]
}

resource "aws_iam_policy" "ses_send_email" {
  name        = "SES_Send_Email_${var.domain}"
  description = "Allows sending emails via SES for ${var.domain}"

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect   = "Allow",
        Action   = "ses:SendEmail",
        Resource = "arn:aws:ses:${var.region}:${var.account_id}:identity/${var.domain}"
      }
    ]
  })
}

resource "aws_iam_user" "ses_user" {
  name = var.user_name
}

resource "aws_iam_user_policy_attachment" "ses_policy_attach" {
  user       = aws_iam_user.ses_user.name
  policy_arn = aws_iam_policy.ses_send_email.arn
}

resource "aws_iam_role_policy_attachment" "cloudwatch" {
  role       = var.cloudwatch_role_name
  policy_arn = aws_iam_policy.ses_send_email.arn
}

resource "aws_iam_access_key" "ses_user_key" {
  user = aws_iam_user.ses_user.name
}
