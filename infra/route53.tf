resource "aws_route53_zone" "getstronger_pro" {
  name = "getstronger.pro"
}

# Elastic IP for EC2 instance
resource "aws_eip" "ec2_instance" {
  instance = aws_instance.backend.id
}

# Route 53 record for api.getstronger.pro -> EC2 instance
resource "aws_route53_record" "api_getstronger_pro" {
  zone_id = aws_route53_zone.getstronger_pro.zone_id
  name    = "api.getstronger.pro"
  type    = "A"
  ttl     = 300
  records = [aws_eip.ec2_instance.public_ip]
}

# Route 53 CNAME record for www.getstronger.pro -> S3 bucket
# resource "aws_route53_record" "www_getstronger_pro" {
#   zone_id = aws_route53_zone.getstronger_pro.zone_id
#   name    = "www.getstronger.pro"
#   type    = "CNAME"
#   ttl     = 300
#   records = [aws_s3_bucket.www_getstronger_pro.website_endpoint]
# }


# # Route 53 alias record for www.getstronger.pro -> S3 bucket
# resource "aws_route53_record" "www_getstronger_pro" {
#   zone_id = aws_route53_zone.getstronger_pro.zone_id
#   name    = "www.getstronger.pro"
#   type    = "A"
#
#   alias {
#     name                   = aws_s3_bucket.vue_js_bucket.website_endpoint
#     zone_id                = aws_s3_bucket.vue_js_bucket.hosted_zone_id
#     evaluate_target_health = false
#   }
# }
