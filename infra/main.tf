terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.16"
    }
  }

  backend "s3" {
    bucket         = "getstronger-terraform-state" # Replace with your bucket name
    key            = "terraform/state.tfstate"     # Define a path to store the state file within the bucket
    region         = "eu-west-2"                # Replace with your AWS region
    dynamodb_table = "terraform-lock-table"        # The DynamoDB table to use for locking
    encrypt        = true                          # Enable encryption at rest
    # shared_credentials_files = "~/.aws/credentials"
  }

  required_version = ">= 1.2.0"
}

provider "aws" {
  region = var.aws_region
}

# resource "aws_dynamodb_table" "terraform_lock" {
#   name         = "terraform-lock"
#   billing_mode = "PAY_PER_REQUEST"
#   hash_key     = "LockID"
#
#   attribute {
#     name = "LockID"
#     type = "S"
#   }
# }

# resource "aws_instance" "app_server" {
#   ami           = "ami-830c94e3"
#   instance_type = "t2.micro"
#
#   tags = {
#     Name = "ExampleAppServerInstance"
#   }
# }
