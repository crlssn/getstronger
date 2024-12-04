resource "aws_ses_domain_identity" "getstronger" {
  domain = "getstronger.pro"
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
        Resource = "*"
      }
    ]
  })
}

