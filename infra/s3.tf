resource "aws_s3_bucket" "vue_js_bucket" {
  bucket = var.bucket_name
  count = 1

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_website_configuration" "vue_js_bucket" {
  bucket = aws_s3_bucket.vue_js_bucket[0].id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

resource "aws_s3_bucket_policy" "public_access" {
  bucket = aws_s3_bucket.vue_js_bucket[0].id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect    = "Allow"
        Principal = "*"
        Action    = ["s3:GetObject"]
        Resource  = ["${aws_s3_bucket.vue_js_bucket[0].arn}/*"]
      }
    ]
  })
}

output "bucket_name" {
  value = aws_s3_bucket.vue_js_bucket[0].bucket
}

output "bucket_website_endpoint" {
  value = aws_s3_bucket.vue_js_bucket[0].website_endpoint
}
