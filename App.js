import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Button,
  TextInput,
  ActivityIndicator,
  TouchableOpacity,
  FlatList,
  Modal,
  Alert,
  StatusBar,
  Keyboard,
  Dimensions,
  Platform,
  Linking,
  Switch,
  Image,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useAudioPlayer } from 'expo-audio';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Animatable from 'react-native-animatable';
import { BlurView } from 'expo-blur';
import POSApp from './POSApp';

const { width, height } = Dimensions.get('window');

// Define physical box dimensions & screen location
const BOX_WIDTH = 260;
const BOX_HEIGHT = 160;

const SUPABASE_URL = 'https://rrevdrqnyveofsyvrtty.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_I9ufFAro4p2TknfrqrieOQ_o2j-d6Ge';

const BARCODE_TYPES = [
  'qr',
  'ean13',
  'ean8',
  'upc_a',
  'upc_e',
  'code39',
  'code93',
  'code128',
  'codabar',
  'itf14',
  'pdf417',
  'aztec',
  'datamatrix',
];

// Change these to your payment links
const PRO_PAYMENT_LINK = 'https://your-lifetime-payment-link.com';
const MONTHLY_PAYMENT_LINK = 'https://your-monthly-payment-link.com';
// Replace this with your real payment link (e.g. a Ko-fi page or PayPal.Me link)
const SELL_PAYMENT_LINK = 'https://your-sell-payment-link.com';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});

export default function App() {
  const [session, setSession] = useState(null);
  const [activeTab, setActiveTab] = useState('scanner');

  const [permission, requestPermission] = useCameraPermissions();

  const [cameraError, setCameraError] = useState(null);
  const handleCameraReady = () => setCameraError(null);
  const handleCameraError = (err) => {
    setCameraError(err?.message || 'Camera failed to start');
  };

  // Center the scan frame on the device screen. Using the full window size
  // (not the camera area, which the bottom tab bar shrinks) keeps the frame
  // exactly in the middle of the display.
  const BOX_X_MIN = (width - BOX_WIDTH) / 2;
  const BOX_X_MAX = BOX_X_MIN + BOX_WIDTH;
  const BOX_Y_MIN = (height - BOX_HEIGHT) / 2;
  const BOX_Y_MAX = BOX_Y_MIN + BOX_HEIGHT;

  const [scanned, setScanned] = useState(false);
  const [dbItems, setDbItems] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  // Pro & Upgrade State
  const [isPro, setIsPro] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Authentication
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUpMode, setIsSignUpMode] = useState(false);

  // Item modal
  const [modalVisible, setModalVisible] = useState(false);
  const [currentBarcode, setCurrentBarcode] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemQuantity, setItemQuantity] = useState('1');
  const [uploading, setUploading] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Search & filters
  const [search, setSearch] = useState('');
  const [minQuantity, setMinQuantity] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  // Offline mode
  const [offline, setOffline] = useState(false);

  // FIFO ordering toggle
  const [fifoMode, setFifoMode] = useState(false);

  // Manual barcode entry (Pro)
  const [manualModal, setManualModal] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');

  // Item photo & low stock threshold (Pro)
  const [itemPhoto, setItemPhoto] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState('0');

  // Sell mode cart
  const [cart, setCart] = useState([]);
  const [cartExpanded, setCartExpanded] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  // Sync scan lock (prevents a single barcode firing twice)
  const scannedRef = useRef(false);
  const scanSound = useAudioPlayer(require('./assets/beep.wav'));

  useEffect(() => {
    const loadFifoSetting = async () => {
      const value = await AsyncStorage.getItem('fifo_order');
      if (value === 'true') setFifoMode(true);
    };
    loadFifoSetting();
  }, []);

  const toggleFifoMode = async (value) => {
    setFifoMode(value);
    await AsyncStorage.setItem('fifo_order', value ? 'true' : 'false');
  };

  // ---- Local item metadata (photo + low stock threshold), stored per barcode ----
  const loadLocalMeta = async () => {
    const raw = await AsyncStorage.getItem('item_meta');
    return raw ? JSON.parse(raw) : {};
  };

  const saveLocalMeta = async (meta) => {
    await AsyncStorage.setItem('item_meta', JSON.stringify(meta));
  };

  const isLowStock = (item) => {
    const threshold = item.low_stock_threshold || 0;
    return threshold > 0 && (item.quantity || 0) <= threshold;
  };

  const lowStockCount = dbItems.filter(isLowStock).length;

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return Alert.alert('Permission required', 'Allow photo library access to attach a photo.');
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });
    if (!result.canceled && result.assets && result.assets[0]) {
      const asset = result.assets[0];
      setItemPhoto(asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri);
    }
  };

  // ---- Sell mode cart ----
  const addToCart = (item) => {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.barcode === item.barcode);
      if (idx >= 0) {
        return prev.map((l, i) => (i === idx ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...prev,
        {
          id: item.id,
          barcode: item.barcode,
          item_name: item.item_name,
          price: item.price || 0,
          qty: 1,
        },
      ];
    });
  };

  const changeCartQty = (barcode, delta) => {
    setCart((prev) =>
      prev
        .map((l) => (l.barcode === barcode ? { ...l, qty: Math.max(0, l.qty + delta) } : l))
        .filter((l) => l.qty > 0)
    );
  };

  const cartTotal = cart.reduce((sum, l) => sum + l.price * l.qty, 0);
  const cartUnits = cart.reduce((sum, l) => sum + l.qty, 0);

  const checkout = async () => {
    if (!cart.length || checkoutBusy) return;
    setCheckoutBusy(true);
    let soldUnits = 0;
    for (const line of cart) {
      const current = dbItems.find((i) => i.id === line.id);
      const newQty = Math.max(0, (current?.quantity || 0) - line.qty);
      soldUnits += line.qty;
      try {
        await supabase.from('inventory').update({ quantity: newQty }).eq('id', line.id);
      } catch (e) {
        // ignore individual failures
      }
    }
    setCheckoutBusy(false);
    setCart([]);
    setCartExpanded(false);
    scannedRef.current = false;
    fetchInventory();
    Alert.alert('Checkout complete', `Sold ${soldUnits} units. Total: $${cartTotal.toFixed(2)}`);
  };

  // ---- Manual barcode entry (Pro) ----
  const openManualEntry = () => {
    if (!isPro) {
      setShowUpgradeModal(true);
      return;
    }
    setManualBarcode('');
    setManualModal(true);
  };

  const submitManualBarcode = () => {
    const barcode = manualBarcode.trim();
    if (!barcode) return Alert.alert('Missing barcode', 'Enter a barcode.');
    setManualModal(false);
    setScanned(true);
    setCurrentBarcode(barcode);
    setItemName('');
    setItemPrice('');
    setItemQuantity('1');
    setItemPhoto('');
    setLowStockThreshold('0');
    setEditingItem(null);
    setModalVisible(true);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
  }, []);

  useEffect(() => {
    const loadProStatus = async () => {
      if (session?.user) {
        const { data } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', session.user.id)
          .eq('status', 'active')
          .single();
        if (data) {
          setIsPro(true);
          await AsyncStorage.setItem('lifetime_subscription', 'true');
        } else {
          const cached = await AsyncStorage.getItem('lifetime_subscription');
          if (cached === 'true') setIsPro(true);
        }
      } else {
        const cached = await AsyncStorage.getItem('lifetime_subscription');
        if (cached === 'true') setIsPro(true);
      }
    };
    loadProStatus();
  }, [session]);

  useEffect(() => {
    if (session) fetchInventory();
  }, [session]);

  const handleAuthSubmit = async () => {
    if (!email || !password) return Alert.alert('Error', 'Please fill in all input boxes.');

    if (isSignUpMode) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) Alert.alert('Sign Up Failed', error.message);
      else Alert.alert('Success', 'Profile registered completely!');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) Alert.alert('Login Failed', error.message);
    }
  };

  const fetchInventory = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .order('scanned_at', { ascending: false });

      if (error) throw error;
      if (data) {
        const meta = await loadLocalMeta();
        const merged = data.map((item) => {
          const m = meta[item.barcode] || {};
          return {
            ...item,
            photo: m.photo || null,
            low_stock_threshold: m.threshold != null ? m.threshold : 0,
          };
        });
        setDbItems(merged);
        await AsyncStorage.setItem('inventory_cache', JSON.stringify(data));
        setOffline(false);
      }
    } catch (e) {
      setOffline(true);
      const cached = await AsyncStorage.getItem('inventory_cache');
      if (cached) {
        const meta = await loadLocalMeta();
        const parsed = JSON.parse(cached).map((item) => {
          const m = meta[item.barcode] || {};
          return {
            ...item,
            photo: m.photo || null,
            low_stock_threshold: m.threshold != null ? m.threshold : 0,
          };
        });
        setDbItems(parsed);
      }
    }
    setRefreshing(false);
  };

  const handleBarcodeScanned = async (scanningResult) => {
    if (scanned || scannedRef.current || modalVisible || showUpgradeModal) return;
    scannedRef.current = true;

    const { data, bounds } = scanningResult;

    if (bounds && bounds.origin) {
      const { x, y } = bounds.origin;
      const isInsideBox =
        x >= BOX_X_MIN &&
        x <= BOX_X_MAX &&
        y >= BOX_Y_MIN &&
        y <= BOX_Y_MAX;

      if (!isInsideBox) {
        scannedRef.current = false;
        return;
      }
    }

    if (activeTab === 'sell') {
      const existing = dbItems.find((i) => i.barcode === data);
      if (!existing) {
        setTimeout(() => {
          scannedRef.current = false;
          setScanned(false);
        }, 600);
        return Alert.alert('Not in inventory', `Barcode ${data} was not found in your stock.`);
      }
      scanSound.seekTo(0);
      scanSound.play();
      setScanned(true);
      addToCart(existing);
      setCartExpanded(true);
      setTimeout(() => {
        scannedRef.current = false;
        setScanned(false);
      }, 400);
      return;
    }

    scanSound.seekTo(0);
    scanSound.play();
    setScanned(true);
    setCurrentBarcode(data);
    setItemName('');
    setItemPrice('');
    setItemQuantity('1');
    setItemPhoto('');
    setLowStockThreshold('0');
    setEditingItem(null);

    setModalVisible(true);
  };

  const openEditItem = (item) => {
    setEditingItem(item);
    setCurrentBarcode(item.barcode || '');
    setItemName(item.item_name || '');
    setItemPrice(item.price ? String(item.price) : '');
    setItemQuantity(item.quantity ? String(item.quantity) : '1');
    setItemPhoto(item.photo || '');
    setLowStockThreshold(item.low_stock_threshold ? String(item.low_stock_threshold) : '0');
    setModalVisible(true);
  };

  const saveItemToCloud = async () => {
    if (!editingItem && !isPro && dbItems.length >= 10) {
      setModalVisible(false);
      setShowUpgradeModal(true);
      return;
    }

    if (!itemName) return Alert.alert('Missing Name', 'Enter a product name.');
    setUploading(true);

    const payload = {
      barcode: currentBarcode,
      item_name: itemName,
      price: parseFloat(itemPrice) || 0.0,
      quantity: parseInt(itemQuantity) || 1,
    };

    try {
      const meta = await loadLocalMeta();
      meta[currentBarcode] = {
        ...(meta[currentBarcode] || {}),
        photo: itemPhoto,
        threshold: parseInt(lowStockThreshold) || 0,
      };
      await saveLocalMeta(meta);

      if (editingItem) {
        const { error } = await supabase
          .from('inventory')
          .update(payload)
          .eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('inventory')
          .upsert([payload], { onConflict: 'barcode' });
        if (error) throw error;
      }

      setModalVisible(false);
      setScanned(false);
      scannedRef.current = false;
      setEditingItem(null);
      fetchInventory();
    } catch (e) {
      Alert.alert('Save failed', e.message);
    } finally {
      setUploading(false);
    }
  };

  const deleteItem = async (itemId) => {
    Alert.alert('Delete item', 'Are you sure you want to delete this item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('inventory').delete().eq('id', itemId);
            if (error) throw error;
            fetchInventory();
          } catch (e) {
            Alert.alert('Delete failed', e.message);
          }
        },
      },
    ]);
  };

  const quickIncrementQuantity = async (item) => {
    try {
      const { error } = await supabase
        .from('inventory')
        .update({ quantity: (item.quantity || 0) + 1 })
        .eq('id', item.id);
      if (error) throw error;
      fetchInventory();
    } catch (e) {
      Alert.alert('Update failed', e.message);
    }
  };

  const filteredItems = dbItems.filter((item) => {
    const nameMatch = item.item_name
      ? item.item_name.toLowerCase().includes(search.toLowerCase())
      : true;
    const barcodeMatch = item.barcode
      ? item.barcode.toLowerCase().includes(search.toLowerCase())
      : true;

    const quantityOk =
      minQuantity === '' ? true : (item.quantity || 0) >= parseInt(minQuantity);
    const priceOk =
      maxPrice === '' ? true : (item.price || 0) <= parseFloat(maxPrice);

    return (nameMatch || barcodeMatch) && quantityOk && priceOk;
  });

  const displayedItems = [...filteredItems].sort((a, b) => {
    const dateA = a.scanned_at ? new Date(a.scanned_at).getTime() : 0;
    const dateB = b.scanned_at ? new Date(b.scanned_at).getTime() : 0;
    return fifoMode ? dateA - dateB : dateB - dateA;
  });

  const totalItems = dbItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
  const totalValue = dbItems.reduce(
    (sum, item) => sum + (item.quantity || 0) * (item.price || 0),
    0
  );
  const mostScanned =
    dbItems.length > 0
      ? dbItems.reduce((prev, curr) =>
          (curr.quantity || 0) > (prev.quantity || 0) ? curr : prev
        )
      : null;

  if (!session) {
    return (
      <View style={styles.authContainer}>
        <Text style={styles.authTitle}>⚡ ScanPulse Mobile</Text>
        <Text style={styles.authSubtitle}>
          {isSignUpMode ? 'Create a new profile to get started' : 'Sign in to scan barcodes'}
        </Text>

        <TextInput
          style={[styles.authInput, { outlineStyle: 'none' }]}
          placeholder="Email"
          placeholderTextColor="#8e8e93"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={[styles.authInput, { outlineStyle: 'none' }]}
          placeholder="Password"
          placeholderTextColor="#8e8e93"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />

        <TouchableOpacity style={styles.submitBtn} onPress={handleAuthSubmit}>
          <Text style={styles.btnText}>{isSignUpMode ? 'Create Account' : 'Sign In'}</Text>
        </TouchableOpacity>

        <View style={styles.toggleRow}>
          <Text style={{ color: '#8e8e93', fontSize: 13 }}>
            {isSignUpMode ? 'Already have an account?' : "Don't have an account?"}
          </Text>
          <TouchableOpacity onPress={() => setIsSignUpMode(!isSignUpMode)}>
            <Text style={styles.toggleLink}>
              {isSignUpMode ? ' Log in instead' : ' Make one!!!!'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="light-content" />

      {/* Item Modal */}
      <Modal visible={modalVisible} animationType="fade" transparent={true}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <BlurView intensity={40} tint="dark" style={styles.modalBlur}>
            <Animatable.View animation="zoomIn" duration={300} style={styles.modalContent}>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                style={styles.modalScroll}
              >
                <Text style={styles.modalTitle}>
                  {editingItem ? '✏️ Edit Item' : '✨ New Item Detected'}
                </Text>
                <Text style={styles.modalBarcode}>ID: {currentBarcode}</Text>
                <TextInput
                  style={[styles.input, { outlineStyle: 'none' }]}
                  placeholder="Product Name"
                  placeholderTextColor="#8e8e93"
                  value={itemName}
                  onChangeText={setItemName}
                />
                <TextInput
                  style={[styles.input, { outlineStyle: 'none' }]}
                  placeholder="Price ($)"
                  placeholderTextColor="#8e8e93"
                  value={itemPrice}
                  onChangeText={setItemPrice}
                  keyboardType="numeric"
                />
                <TextInput
                  style={[styles.input, { outlineStyle: 'none' }]}
                  placeholder="Quantity"
                  placeholderTextColor="#8e8e93"
                  value={itemQuantity}
                  onChangeText={setItemQuantity}
                  keyboardType="numeric"
                />

                {isPro && (
                  <>
                    <View style={styles.photoRow}>
                      {itemPhoto ? (
                        <Image source={{ uri: itemPhoto }} style={styles.photoPreview} />
                      ) : (
                        <View style={[styles.photoPreview, styles.photoPlaceholder]}>
                          <Text style={{ color: '#8e8e93', fontSize: 11 }}>No photo</Text>
                        </View>
                      )}
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: '#3a86ff', flex: 1 }]}
                        onPress={pickPhoto}
                      >
                        <Text style={styles.btnText}>{itemPhoto ? 'Change Photo' : 'Add Photo'}</Text>
                      </TouchableOpacity>
                    </View>
                    <TextInput
                      style={[styles.input, { outlineStyle: 'none' }]}
                      placeholder="Low stock alert at (e.g. 5)"
                      placeholderTextColor="#8e8e93"
                      value={lowStockThreshold}
                      onChangeText={setLowStockThreshold}
                      keyboardType="numeric"
                    />
                  </>
                )}
              </ScrollView>

              {uploading ? (
                <ActivityIndicator color="#3a86ff" style={{ marginTop: 10 }} />
              ) : (
                <View style={styles.modalButtons}>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#2c2c2e', flex: 1, marginRight: 6 }]}
                      onPress={() => {
                        setModalVisible(false);
                        setScanned(false);
                        scannedRef.current = false;
                        setEditingItem(null);
                      }}
                    >
                      <Text style={{ color: '#ff453a', fontWeight: '700' }}>Cancel</Text>
                    </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#3a86ff', flex: 1, marginLeft: 6 }]}
                    onPress={saveItemToCloud}
                  >
                    <Text style={styles.btnText}>
                      {editingItem ? 'Update Item' : 'Save Stock'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </Animatable.View>
          </BlurView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Manual Barcode Entry Modal */}
      <Modal visible={manualModal} animationType="fade" transparent={true}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <BlurView intensity={40} tint="dark" style={styles.modalBlur}>
            <Animatable.View animation="zoomIn" duration={300} style={styles.modalContent}>
              <Text style={styles.modalTitle}>⌨️ Manual Barcode</Text>
              <Text style={styles.modalBarcode}>Type a barcode the camera couldn't read.</Text>
              <TextInput
                style={[styles.input, { outlineStyle: 'none' }]}
                placeholder="Barcode / product ID"
                placeholderTextColor="#8e8e93"
                value={manualBarcode}
                onChangeText={setManualBarcode}
                autoCapitalize="none"
                autoFocus
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#2c2c2e', flex: 1, marginRight: 6 }]}
                  onPress={() => setManualModal(false)}
                >
                  <Text style={{ color: '#ff453a', fontWeight: '700' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#3a86ff', flex: 1, marginLeft: 6 }]}
                  onPress={submitManualBarcode}
                >
                  <Text style={styles.btnText}>Continue</Text>
                </TouchableOpacity>
              </View>
            </Animatable.View>
          </BlurView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Upgrade / Paywall Modal */}
      <Modal visible={showUpgradeModal} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <BlurView intensity={40} tint="dark" style={styles.modalBlur}>
            <Animatable.View animation="zoomIn" duration={300} style={styles.modalContent}>
              <Text style={styles.modalTitle}>🚀 Unlock Unlimited Scans</Text>
              <Text style={styles.modalBarcode}>
                Upgrade to Pro for unlimited items, item photos, low-stock alerts, and manual
                barcode entry.
              </Text>

              <View style={{ marginTop: 10, gap: 10 }}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#3a86ff', width: '100%' }]}
                  onPress={() => Linking.openURL(PRO_PAYMENT_LINK)}
                >
                  <Text style={styles.btnText}>Pay Now - Lifetime (€20)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#10b981', width: '100%' }]}
                  onPress={() => Linking.openURL(MONTHLY_PAYMENT_LINK)}
                >
                  <Text style={styles.btnText}>Pay Now - 2 Months (€5)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#2c2c2e', marginTop: 5, width: '100%' }]}
                  onPress={() => setShowUpgradeModal(false)}
                >
                  <Text style={{ color: '#ff453a', fontWeight: '700' }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </Animatable.View>
          </BlurView>
        </View>
      </Modal>

      <View style={{ flex: 1 }}>
        {activeTab === 'scanner' ? (
          !permission ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator color="#3a86ff" />
            </View>
          ) : !permission.granted ? (
            <View style={styles.centerContainer}>
              <Text style={{ color: '#fff', marginBottom: 10 }}>
                Camera permission is required.
              </Text>
              <Button onPress={requestPermission} title="Enable Camera View" color="#3a86ff" />
            </View>
          ) : (
            <View style={styles.cameraWrapper} pointerEvents="auto">
              <CameraView
                facing="back"
                style={StyleSheet.absoluteFillObject}
                onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
                onCameraReady={handleCameraReady}
                onMountError={handleCameraError}
                barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
              />
              <View
                style={[
                  styles.scanTargetBox,
                  { top: BOX_Y_MIN, left: BOX_X_MIN },
                ]}
              />
              <TouchableOpacity
                style={[
                  styles.manualButton,
                  { top: BOX_Y_MIN + BOX_HEIGHT + 20 },
                ]}
                onPress={openManualEntry}
              >
                <Text style={styles.manualButtonText}>⌨️ Manual Barcode</Text>
              </TouchableOpacity>
              {cameraError ? (
                <View style={styles.cameraErrorOverlay}>
                  <Text style={styles.cameraErrorText}>⚠️ {cameraError}</Text>
                  <Button
                    onPress={() => {
                      setCameraError(null);
                      requestPermission();
                    }}
                    title="Retry Camera"
                    color="#3a86ff"
                  />
                </View>
              ) : null}
            </View>
          )
        ) : activeTab === 'sell' ? (
          !permission ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator color="#10b981" />
            </View>
          ) : !permission.granted ? (
            <View style={styles.centerContainer}>
              <Text style={{ color: '#fff', marginBottom: 10 }}>
                Camera permission is required.
              </Text>
              <Button onPress={requestPermission} title="Enable Camera View" color="#10b981" />
            </View>
          ) : (
            <View style={styles.cameraWrapper} pointerEvents="auto">
              <CameraView
                facing="back"
                style={StyleSheet.absoluteFillObject}
                onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
                onCameraReady={handleCameraReady}
                onMountError={handleCameraError}
                barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
              />
              <View
                style={[
                  styles.scanTargetBox,
                  { top: BOX_Y_MIN, left: BOX_X_MIN, borderColor: '#10b981' },
                ]}
              />
              <View style={styles.sellCartPanel}>
                <TouchableOpacity
                  style={styles.cartBar}
                  onPress={() => setCartExpanded(!cartExpanded)}
                >
                  <Text style={styles.cartBarText}>
                    🛒 {cartUnits} items · ${cartTotal.toFixed(2)} {cartExpanded ? '▼' : '▲'}
                  </Text>
                </TouchableOpacity>
                {cartExpanded && (
                  <>
                    <FlatList
                      data={cart}
                      keyExtractor={(l) => l.barcode.toString()}
                      style={{ maxHeight: 220 }}
                      contentContainerStyle={{ paddingHorizontal: 16 }}
                      renderItem={({ item }) => (
                        <View style={styles.cartItemRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.itemNameText}>{item.item_name}</Text>
                            <Text style={styles.barcodeText}>
                              {item.qty} × ${item.price?.toFixed(2) || '0.00'} = $
                              {(item.qty * (item.price || 0)).toFixed(2)}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <TouchableOpacity onPress={() => changeCartQty(item.barcode, -1)}>
                              <Text style={{ color: '#ff453a', fontWeight: '800', fontSize: 18 }}>−</Text>
                            </TouchableOpacity>
                            <Text style={{ color: '#fff', fontWeight: '700', width: 24, textAlign: 'center' }}>
                              {item.qty}
                            </Text>
                            <TouchableOpacity onPress={() => changeCartQty(item.barcode, 1)}>
                              <Text style={{ color: '#30d158', fontWeight: '800', fontSize: 18 }}>+</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                      ListEmptyComponent={
                        <Text style={{ color: '#8e8e93', textAlign: 'center', padding: 16 }}>
                          Scan items to add them to the cart.
                        </Text>
                      }
                    />
                    <TouchableOpacity style={styles.checkoutBtn} onPress={checkout}>
                      {checkoutBusy ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <Text style={styles.btnText}>Checkout · ${cartTotal.toFixed(2)}</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.payLinkBtn}
                      onPress={() => Linking.openURL(SELL_PAYMENT_LINK)}
                      disabled={!cart.length}
                    >
                      <Text style={styles.btnText}>🔗 Pay with Payment Link</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          )
        ) : activeTab === 'pos' ? (
          <POSApp />
        ) : (
          <FlatList
            data={displayedItems}
            keyExtractor={(item) => item.id.toString()}
            refreshing={refreshing}
            onRefresh={fetchInventory}
            contentContainerStyle={styles.inventoryContainer}
            ListHeaderComponent={
              <>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 20,
                  }}
                >
                  <Text style={styles.tabHeading}>📦 Stockroom</Text>
                  <TouchableOpacity onPress={() => supabase.auth.signOut()}>
                    <Text style={{ color: '#ff453a', fontWeight: '700' }}>Sign Out</Text>
                  </TouchableOpacity>
                </View>

                <BlurView intensity={35} tint="dark" style={styles.glassCard}>
                  <Text style={styles.analyticsTitle}>📊 Inventory Dashboard</Text>
                  <Text style={styles.analyticsText}>Total units: {totalItems}</Text>
                  <Text style={styles.analyticsText}>
                    Total value: ${totalValue.toFixed(2)}
                  </Text>
                  {mostScanned ? (
                    <Text style={styles.analyticsText}>
                      Top item: {mostScanned.item_name} ({mostScanned.quantity} units)
                    </Text>
                  ) : (
                    <Text style={styles.analyticsText}>No items yet.</Text>
                  )}
                  {isPro && lowStockCount > 0 && (
                    <Text style={[styles.analyticsText, { color: '#ff453a', fontWeight: '700' }]}>
                      ⚠️ {lowStockCount} item{lowStockCount > 1 ? 's' : ''} low on stock
                    </Text>
                  )}
                </BlurView>

                <BlurView intensity={30} tint="dark" style={styles.glassCard}>
                  <Text style={styles.analyticsTitle}>🔍 Search & Filters</Text>
                  <TextInput
                    style={[styles.input, { outlineStyle: 'none' }]}
                    placeholder="Search by name or barcode"
                    placeholderTextColor="#8e8e93"
                    value={search}
                    onChangeText={setSearch}
                  />
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TextInput
                      style={[styles.input, { flex: 1, outlineStyle: 'none' }]}
                      placeholder="Min quantity"
                      placeholderTextColor="#8e8e93"
                      value={minQuantity}
                      onChangeText={setMinQuantity}
                      keyboardType="numeric"
                    />
                    <TextInput
                      style={[styles.input, { flex: 1, outlineStyle: 'none' }]}
                      placeholder="Max price"
                      placeholderTextColor="#8e8e93"
                      value={maxPrice}
                      onChangeText={setMaxPrice}
                      keyboardType="numeric"
                    />
                  </View>
                  {offline && (
                    <Text style={{ color: '#ff9f0a', marginTop: 6 }}>
                      Offline mode: showing cached inventory.
                    </Text>
                  )}
                </BlurView>

                <BlurView intensity={30} tint="dark" style={styles.glassCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.analyticsTitle}>⚙️ Settings</Text>
                      <Text style={styles.analyticsText}>
                        {fifoMode
                          ? 'FIFO: oldest items first (first in, first out)'
                          : 'LIFO: newest items first'}
                      </Text>
                    </View>
                    <Switch
                      value={fifoMode}
                      onValueChange={toggleFifoMode}
                      trackColor={{ false: '#3a3a3c', true: '#3a86ff' }}
                      thumbColor={fifoMode ? '#ffffff' : '#8e8e93'}
                    />
                  </View>
                </BlurView>
              </>
            }
            renderItem={({ item }) => {
              const lowStock = isPro && isLowStock(item);
              return (
                <Animatable.View animation="fadeInUp" duration={400}>
                  <BlurView
                    intensity={25}
                    tint="dark"
                    style={[styles.itemRow, lowStock && styles.lowStockRow]}
                  >
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => openEditItem(item)}
                      onLongPress={() => quickIncrementQuantity(item)}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {isPro && item.photo ? (
                          <Image source={{ uri: item.photo }} style={styles.itemThumb} />
                        ) : null}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemNameText}>
                            {item.item_name || 'Generic Asset'}
                          </Text>
                          <Text style={styles.barcodeText}>#{item.barcode}</Text>
                          <Text style={styles.barcodeText}>
                            ${item.price?.toFixed(2) || '0.00'} · {item.quantity} units
                          </Text>
                          {lowStock && (
                            <Text style={{ color: '#ff453a', fontWeight: '800', marginTop: 2 }}>
                              ⚠️ LOW STOCK
                            </Text>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteItem(item.id)}>
                      <Text style={{ color: '#ff453a', fontWeight: '700' }}>Delete</Text>
                    </TouchableOpacity>
                  </BlurView>
                </Animatable.View>
              );
            }}
          />
        )}
      </View>

      <BlurView intensity={35} tint="dark" style={styles.tabBar}>
        <TouchableOpacity style={styles.tabButton} onPress={() => setActiveTab('scanner')}>
          <Animatable.Text
            animation={activeTab === 'scanner' ? 'pulse' : undefined}
            iterationCount="infinite"
            duration={1200}
            style={[styles.tabButtonText, activeTab === 'scanner' && styles.activeTabText]}
          >
            📷 Scan
          </Animatable.Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabButton} onPress={() => setActiveTab('sell')}>
          <Animatable.Text
            animation={activeTab === 'sell' ? 'pulse' : undefined}
            iterationCount="infinite"
            duration={1200}
            style={[styles.tabButtonText, activeTab === 'sell' && styles.activeTabTextSell]}
          >
            🛒 Sell
          </Animatable.Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabButton} onPress={() => setActiveTab('inventory')}>
          <Animatable.Text
            animation={activeTab === 'inventory' ? 'pulse' : undefined}
            iterationCount="infinite"
            duration={1200}
            style={[styles.tabButtonText, activeTab === 'inventory' && styles.activeTabText]}
          >
            📦 Vault
          </Animatable.Text>
        </TouchableOpacity>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#000000' },
  authContainer: {
    flex: 1,
    backgroundColor: '#090d16',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  authTitle: { fontSize: 26, fontWeight: '900', color: '#fff', marginBottom: 6 },
  authSubtitle: { fontSize: 13, color: '#8e8e93', marginBottom: 24, textAlign: 'center' },
  authInput: {
    width: '100%',
    height: 48,
    borderColor: '#1f2937',
    borderWidth: 1.5,
    marginBottom: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#030712',
    color: '#ffffff',
  },
  submitBtn: {
    width: '100%',
    height: 48,
    backgroundColor: '#3a86ff',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
  },
  toggleRow: { flexDirection: 'row', marginTop: 16, alignItems: 'center' },
  toggleLink: { color: '#60a5fa', fontWeight: '800', fontSize: 13 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  cameraWrapper: { flex: 1 },
  cameraErrorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 20,
    gap: 12,
  },
  cameraErrorText: { color: '#ffffff', fontSize: 15, textAlign: 'center' },
  input: {
    width: '100%',
    height: 48,
    borderColor: '#2c2c2e',
    borderWidth: 1.5,
    marginBottom: 14,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(28,28,30,0.7)',
    color: '#ffffff',
  },
  scanTargetBox: {
    position: 'absolute',
    width: BOX_WIDTH,
    height: BOX_HEIGHT,
    borderWidth: 2,
    borderColor: '#3a86ff',
    borderRadius: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBlur: { width: '88%', borderRadius: 20, overflow: 'hidden' },
  modalContent: { padding: 24, overflow: 'visible', maxHeight: '85%' },
  modalScroll: { maxHeight: 400 },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  photoPreview: {
    width: 56,
    height: 56,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  photoPlaceholder: {
    backgroundColor: 'rgba(28,28,30,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  manualButton: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  manualButtonText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  cartBar: {
    backgroundColor: 'rgba(16,185,129,0.9)',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  cartBarText: { color: '#ffffff', fontWeight: '800', fontSize: 14 },
  sellCartPanel: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    borderRadius: 14,
    backgroundColor: 'rgba(10,10,12,0.88)',
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  checkoutBtn: {
    marginTop: 10,
    backgroundColor: '#10b981',
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  payLinkBtn: {
    marginTop: 8,
    backgroundColor: '#3a86ff',
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  itemThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    marginRight: 12,
  },
  lowStockRow: {
    borderColor: '#ff453a',
    borderWidth: 1.5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 4,
  },
  modalText: { fontSize: 14, color: '#ffffff' },
  modalBarcode: { fontSize: 11, color: '#8e8e93', marginBottom: 20, textAlign: 'center' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 },
  actionBtn: {
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  btnText: { color: '#ffffff', fontWeight: '700' },
  inventoryContainer: { padding: 20, paddingTop: 60, paddingBottom: 100 },
  tabHeading: { fontSize: 24, fontWeight: '800', color: '#ffffff', marginBottom: 10 },
  glassCard: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  analyticsTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff', marginBottom: 6 },
  analyticsText: { fontSize: 13, color: '#d1d1d6', marginTop: 2 },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  itemNameText: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
  barcodeText: { fontSize: 12, color: '#8e8e93', marginTop: 2 },
  tabBar: {
    flexDirection: 'row',
    height: 80,
    backgroundColor: 'rgba(10,10,12,0.9)',
    paddingBottom: 15,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  tabButton: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabButtonText: { fontSize: 14, color: '#8e8e93', fontWeight: '600' },
  activeTabText: { color: '#3a86ff' },
  activeTabTextSell: { color: '#10b981' },
});