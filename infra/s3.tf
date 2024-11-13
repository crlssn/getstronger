resource "aws_s3_bucket" "vue_js_bucket" {
  bucket = "vue-js-app"
}

resource "aws_s3_bucket_website_configuration" "vue_js_bucket" {
  bucket = aws_s3_bucket.vue_js_bucket.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

resource "aws_s3_bucket_public_access_block" "public_access_block" {
  bucket = aws_s3_bucket.vue_js_bucket.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "public_access" {
  bucket = aws_s3_bucket.vue_js_bucket.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect    = "Allow"
        Principal = "*"
        Action    = ["s3:GetObject"]
        Resource  = ["${aws_s3_bucket.vue_js_bucket.arn}/*"]
      }
    ]
  })
}

resource "aws_s3_bucket" "getstronger_binaries" {
  bucket = "getstronger-binaries"
}
