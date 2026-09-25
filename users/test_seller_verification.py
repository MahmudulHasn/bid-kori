"""Tests for seller verification submit, review, and permissions."""

from io import BytesIO
from PIL import Image
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from notifications.models import Notification
from users.models import SellerVerification, UserProfile


def _create_image_file(name='nid.jpg'):
    file_obj = BytesIO()
    image = Image.new('RGB', (100, 100), color='blue')
    image.save(file_obj, 'JPEG')
    file_obj.seek(0)
    return SimpleUploadedFile(name, file_obj.read(), content_type='image/jpeg')


class SellerVerificationTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Seller
        self.seller = User.objects.create_user(
            username='seller1',
            email='seller1@example.com',
            password='Password123!',
        )
        UserProfile.objects.create(user=self.seller, role=UserProfile.Role.SELLER)

        # Admin
        self.admin = User.objects.create_user(
            username='admin1',
            email='admin1@example.com',
            password='Password123!',
            is_staff=True,
        )


    def test_status_endpoint_unverified(self):
        self.client.force_authenticate(user=self.seller)
        resp = self.client.get('/api/users/verification/status/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIsNone(resp.data['status'])

    def test_submit_verification(self):
        self.client.force_authenticate(user=self.seller)
        img = _create_image_file()
        data = {
            'nid_passport_image': img,
            'whatsapp_number': '+8801712345678',
            'location': 'Dhaka, Bangladesh',
        }
        resp = self.client.post(
            '/api/users/verification/submit/',
            data,
            format='multipart',
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data['status'], 'PENDING')
        self.assertEqual(resp.data['whatsapp_number'], '+8801712345678')
        self.assertEqual(resp.data['location'], 'Dhaka, Bangladesh')

        # Verify admin got notification
        notif = Notification.objects.filter(
            user=self.admin,
            type=Notification.Type.SELLER_VERIFICATION_SUBMITTED,
        ).first()
        self.assertIsNotNone(notif)

    def test_product_create_permission_gated_by_verification(self):
        self.client.force_authenticate(user=self.seller)
        # Attempt to create product while unverified
        resp = self.client.post(
            '/api/products/',
            {'title': 'Test Product', 'condition': 'NEW'},
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('complete seller verification', str(resp.data))


        # Submit verification
        SellerVerification.objects.create(
            user=self.seller,
            nid_passport_image=_create_image_file(),
            whatsapp_number='+8801712345678',
            location='Dhaka',
            status=SellerVerification.Status.PENDING,
        )

        # Still forbidden while pending
        resp = self.client.post(
            '/api/products/',
            {'title': 'Test Product', 'condition': 'NEW'},
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

        # Now approve verification
        verification = self.seller.seller_verification
        verification.status = SellerVerification.Status.APPROVED
        verification.save()

        # Should now succeed in creating product
        resp = self.client.post(
            '/api/products/',
            {'title': 'Test Product', 'condition': 'NEW'},
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_admin_review_workflow(self):
        verification = SellerVerification.objects.create(
            user=self.seller,
            nid_passport_image=_create_image_file(),
            whatsapp_number='+8801712345678',
            location='Dhaka',
            status=SellerVerification.Status.PENDING,
        )

        # Non-staff cannot access admin endpoint
        self.client.force_authenticate(user=self.seller)
        resp = self.client.get('/api/admin/verifications/')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

        # Admin lists verifications
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get('/api/admin/verifications/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]['username'], 'seller1')

        # Admin approves
        resp = self.client.post(f'/api/admin/verifications/{verification.id}/approve/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['status'], 'APPROVED')

        # Check notification sent to seller
        seller_notif = Notification.objects.filter(
            user=self.seller,
            type=Notification.Type.SELLER_VERIFICATION_APPROVED,
        ).first()
        self.assertIsNotNone(seller_notif)

        # Check /users/me/ serializer has seller_verified=APPROVED
        self.client.force_authenticate(user=self.seller)
        me_resp = self.client.get('/api/users/me/')
        self.assertEqual(me_resp.data['seller_verified'], 'APPROVED')

    def test_rejection_and_resubmission(self):
        verification = SellerVerification.objects.create(
            user=self.seller,
            nid_passport_image=_create_image_file(),
            whatsapp_number='+8801712345678',
            location='Dhaka',
            status=SellerVerification.Status.PENDING,
        )

        # Admin rejects with note
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            f'/api/admin/verifications/{verification.id}/reject/',
            {'admin_note': 'Uploaded photo is blurry. Please upload clear NID.'},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['status'], 'REJECTED')
        self.assertEqual(resp.data['admin_note'], 'Uploaded photo is blurry. Please upload clear NID.')

        # Check rejection notification sent to seller
        seller_notif = Notification.objects.filter(
            user=self.seller,
            type=Notification.Type.SELLER_VERIFICATION_REJECTED,
        ).first()
        self.assertIsNotNone(seller_notif)
        self.assertIn('blurry', seller_notif.message)

        # Seller status is REJECTED
        self.client.force_authenticate(user=self.seller)
        status_resp = self.client.get('/api/users/verification/status/')
        self.assertEqual(status_resp.data['status'], 'REJECTED')
        self.assertEqual(status_resp.data['admin_note'], 'Uploaded photo is blurry. Please upload clear NID.')

        # Seller can resubmit with new document
        new_img = _create_image_file(name='clear_nid.jpg')
        resubmit_resp = self.client.post(
            '/api/users/verification/submit/',
            {
                'nid_passport_image': new_img,
                'whatsapp_number': '+8801799999999',
                'location': 'Gulshan, Dhaka',
            },
            format='multipart',
        )
        self.assertEqual(resubmit_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resubmit_resp.data['status'], 'PENDING')
        self.assertEqual(resubmit_resp.data['whatsapp_number'], '+8801799999999')
        self.assertEqual(resubmit_resp.data['location'], 'Gulshan, Dhaka')

