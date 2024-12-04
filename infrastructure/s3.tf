resource "aws_s3_bucket" "www_getstronger_pro" {
  bucket = "www.getstronger.pro"
}

resource "aws_s3_bucket_website_configuration" "vue_js_bucket" {
  bucket = aws_s3_bucket.www_getstronger_pro.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

resource "aws_s3_bucket_public_access_block" "public_access_block" {
  bucket = aws_s3_bucket.www_getstronger_pro.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "public_access" {
  bucket = aws_s3_bucket.www_getstronger_pro.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect    = "Allow"
        Principal = "*"
        Action    = ["s3:GetObject"]
        Resource  = ["${aws_s3_bucket.www_getstronger_pro.arn}/*"]
      }
    ]
  })
}

resource "aws_s3_bucket" "redirect_getstronger_pro" {
  bucket = "getstronger.pro"
}

resource "aws_s3_bucket_website_configuration" "redirect_bucket" {
  bucket = aws_s3_bucket.redirect_getstronger_pro.id

  redirect_all_requests_to {
    host_name = "www.getstronger.pro"
    protocol  = "https"
  }
}

resource "aws_s3_bucket_policy" "redirect_policy" {
  bucket = aws_s3_bucket.redirect_getstronger_pro.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect    = "Allow"
        Principal = "*"
        Action    = ["s3:GetObject"]
        Resource  = ["${aws_s3_bucket.redirect_getstronger_pro.arn}/*"]
      }
    ]
  })
}

