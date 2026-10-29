import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TouchableWithoutFeedback,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../theme';

/**
 * CustomAlertModal
 * Modal แจ้งเตือนสไตล์โมเดิร์น โทนสีแดงเด่นชัดสำหรับ error / warning ตามความต้องการของผู้ใช้
 */
const CustomAlertModal = ({
  visible,
  title = 'แจ้งเตือน',
  message = '',
  type = 'warning', // 'warning' | 'error' | 'success' | 'info'
  confirmText = 'ตกลง',
  cancelText,
  onConfirm,
  onCancel,
  onClose,
}) => {
  if (!visible) return null;

  const isRed = type === 'warning' || type === 'error';
  const isSuccess = type === 'success';

  const themeColors = isRed
    ? {
        main: '#D9381E',
        lightBg: '#FFEBEE',
        border: '#FFCDD2',
        icon: 'alert-circle',
      }
    : isSuccess
    ? {
        main: '#2E7D32',
        lightBg: '#E8F5E9',
        border: '#C8E6C9',
        icon: 'checkmark-circle',
      }
    : {
        main: COLORS.primary,
        lightBg: COLORS.primaryLight,
        border: COLORS.border,
        icon: 'information-circle',
      };

  const handleConfirm = () => {
    if (onConfirm) onConfirm();
    else if (onClose) onClose();
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    else if (onClose) onClose();
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose || handleConfirm}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose || handleConfirm}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={styles.card}>
              {/* Top Accent Strip */}
              <View style={[styles.topStrip, { backgroundColor: themeColors.main }]} />

              <View style={styles.body}>
                {/* Red Icon Badge */}
                <View
                  style={[
                    styles.iconBadge,
                    {
                      backgroundColor: themeColors.lightBg,
                      borderColor: themeColors.border,
                    },
                  ]}
                >
                  <Ionicons name={themeColors.icon} size={38} color={themeColors.main} />
                </View>

                {/* Title */}
                {!!title && (
                  <Text style={[styles.title, { color: themeColors.main }]}>
                    {title}
                  </Text>
                )}

                {/* Message */}
                {!!message && <Text style={styles.message}>{message}</Text>}

                {/* Action Buttons */}
                <View style={[styles.buttonContainer, cancelText ? styles.buttonRow : null]}>
                  {!!cancelText && (
                    <TouchableOpacity
                      style={[styles.button, styles.cancelButton]}
                      onPress={handleCancel}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.cancelButtonText}>{cancelText}</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[
                      styles.button,
                      { backgroundColor: themeColors.main },
                      cancelText ? styles.flexButton : styles.fullButton,
                    ]}
                    onPress={handleConfirm}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.confirmButtonText}>{confirmText}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: Math.min(width - 48, 380),
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    overflow: 'hidden',
    ...SHADOWS.large,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  topStrip: {
    height: 5,
    width: '100%',
  },
  body: {
    paddingTop: 24,
    paddingBottom: 20,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  iconBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  message: {
    fontSize: 15,
    color: '#334155',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 22,
  },
  buttonContainer: {
    width: '100%',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullButton: {
    width: '100%',
  },
  flexButton: {
    flex: 1,
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  cancelButtonText: {
    color: '#475569',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default CustomAlertModal;
