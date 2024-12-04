resource "aws_instance" "backend" {
  ami                  = "ami-02f617729751b375a"
  instance_type        = "t2.micro"
  security_groups      = [aws_security_group.ssh_access.name, aws_security_group.api_access.name]
  key_name             = aws_key_pair.backend_ec2_key.key_name
  iam_instance_profile = aws_iam_instance_profile.ec2_instance_profile.name

  user_data = <<-EOT
#!/bin/bash
# Update and install CloudWatch Agent
sudo yum update -y
sudo yum install -y amazon-cloudwatch-agent

# Create CloudWatch Agent configuration
cat <<EOF > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/app.log",
            "log_group_name": "/aws/backend-service/logs",
            "log_stream_name": "{instance_id}/stdout",
            "timestamp_format": "%Y-%m-%d %H:%M:%S"
          },
          {
            "file_path": "/var/log/app.err",
            "log_group_name": "/aws/backend-service/logs",
            "log_stream_name": "{instance_id}/stderr",
            "timestamp_format": "%Y-%m-%d %H:%M:%S"
          }
        ]
      }
    }
  }
}
EOF

# Start the CloudWatch Agent
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a start -m ec2 \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
EOT
}

resource "aws_key_pair" "backend_ec2_key" {
  key_name   = "backend-ec2-key"
  public_key = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQDIW6zV0WOcWG4+CizaD9KkgbHvtz4yJNdy5RuMl1GfLqWC5bosw7gejuI4+0WKvp+zePMdcZUh3pu+Quor9ttc3agQybS1sc5ipHOYk+sGVZUIM70wVvtTtj5M3tnycUps41Ufv9CgSl0WiUH1kURBvUQdqtLjrViNK1V8rsDx6lRTS9zNFXd8K+EVujztgnsygWL934qcvu8mZUb5SXvhgJq1LmsVY4uVkH4sVP8c1IbuBtPL+O+JLfDCwNGZqBYKehaVz14+It9+wqW2Df/izQVcgzUOX8wl1jEa808CGHx3QuW8WOmDxeiIUzfN0LzA2O4WAJGEfIwX2fVXSLSN6vTegteDs5g7Sree74UZglMtzvvozInyCOLkGeNQFyeN3Kuc/bs6Sp7iAdO/3w/YT3AI+U2CkAJ8GMw+nDEUTskloO5I4IANCttBm11fqAR3Lij8cxZsheVrKhgYXmaoEOh62FRoOW4GxsGZRfaeG5Rb4T9rINyjY4KV2mgpkr9OMwfSAkugEDZUHVgZEdfAxqOgngQ7PgNt/N2G+sNwzbOQ9GbIpa86FLa0/fchqfFjKJWDZ6VJTybjDDpLASCOnmoVrgYe4imvoCXqEJulnuoxOhkY3yfuqwY3c5nWD3PSXWe/UnHe9+7u5qlOKNZ5TkSvULOBww78qYXLZXM2Ew== christian@Mac"
}

resource "aws_security_group" "ssh_access" {
  name        = "allow_ssh"
  description = "Allow SSH inbound traffic"

  ingress {
    description = "SSH from anywhere"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # DEBT: Do not allow SSH from anywhere
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "api_access" {
  name        = "allow_api_access"
  description = "Allow inbound traffic to API"

  ingress {
    description = "Allow HTTP traffic"
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Allow HTTP traffic"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Allow HTTPS traffic"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}


output "ec2_instance_public_ip" {
  value = aws_instance.backend.public_ip
}
