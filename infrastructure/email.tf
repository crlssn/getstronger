resource "aws_ses_domain_identity" "getstronger" {
  domain = var.domain
}

resource "aws_route53_record" "ses_verification" {
  zone_id = aws_route53_zone.getstronger_pro.zone_id
  name    = "_amazonses.getstronger.pro"
  type    = "TXT"
  ttl     = 600
  records = [aws_ses_domain_identity.getstronger.verification_token]
}

resource "aws_ses_domain_dkim" "getstronger" {
  domain = aws_ses_domain_identity.getstronger.domain
}

resource "aws_route53_record" "dkim" {
  for_each = toset(aws_ses_domain_dkim.getstronger.dkim_tokens)
  zone_id  = aws_route53_zone.getstronger_pro.zone_id
  name     = "${each.value}._domainkey.getstronger.pro"
  type     = "CNAME"
  ttl      = 600
  records  = ["${each.value}.dkim.amazonses.com"]
}

resource "aws_route53_record" "spf" {
  zone_id = aws_route53_zone.getstronger_pro.zone_id
  name    = "getstronger.pro"
  type    = "TXT"
  ttl     = 600
  records = ["v=spf1 include:amazonses.com ~all"]
}

resource "aws_iam_policy" "ses_send_email" {
  name        = "SES_Send_Email_GetStronger_Pro"
  description = "Allows sending emails via SES for getstronger.pro"
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect   = "Allow",
        Action   = "ses:SendEmail",
        Resource = "arn:aws:ses:eu-west-2:205930632120:identity/getstronger.pro"
      }
    ]
  })
}

resource "aws_iam_user" "ses_user" {
  name = "ses_user_getstronger_pro"
}

resource "aws_iam_user_policy_attachment" "ses_policy_attach" {
  user       = aws_iam_user.ses_user.name
  policy_arn = aws_iam_policy.ses_send_email.arn
}

resource "aws_iam_role_policy_attachment" "ses_policy_cloudwatch" {
  role       = aws_iam_role.ec2_cloudwatch_role.name
  policy_arn = aws_iam_policy.ses_send_email.arn
}

resource "aws_iam_access_key" "ses_user_key" {
  user = aws_iam_user.ses_user.name
}

resource "aws_route53_record" "mx_record" {
  zone_id = aws_route53_zone.getstronger_pro.zone_id
  name    = "getstronger.pro"
  type    = "MX"
  ttl     = 300
  records = ["10 inbound-smtp.eu-west-2.amazonaws.com", "10 feedback-smtp.eu-west-2.amazonses.com"]
}


