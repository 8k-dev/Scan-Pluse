import React, { useState, useEffect } from 'react';
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
  TouchableWithoutFeedback, 
  Keyboard,
  Image,
  Dimensions
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Animatable from 'react-native-animatable';
import { BlurView } from 'expo-blur';

const { width, height } = Dimensions.get('window');

// Define physical box dimensions & screen location
const BOX_WIDTH = 260;
const BOX_HEIGHT = 160;
const BOX_X_MIN = (width - BOX_WIDTH) / 2;
const BOX_X_MAX = BOX_X_MIN + BOX_WIDTH;
const BOX_Y_MIN = (height - BOX_HEIGHT) / 2;
const BOX_Y_MAX = BOX_Y_MIN + BOX_HEIGHT;

const SUPABASE_URL = 'https://rrevdrqnyveofsyvrtty.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_I9ufFAro4p2TknfrqrieOQ_o2j-d6Ge';

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

  const [scanned, setScanned] = useState(false);
  const [dbItems, setDbItems] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

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
  const [itemImageUrl, setItemImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Search & filters
  const [search, setSearch] = useState('');
  const [minQuantity, setMinQuantity] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  // Offline mode
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
  }, []);

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
        setDbItems(data);
        await AsyncStorage.setItem('inventory_cache', JSON.stringify(data));
        setOffline(false);
      }
    } catch (e) {
      setOffline(true);
      const cached = await AsyncStorage.getItem('inventory_cache');
      if (cached) {
        setDbItems(JSON.parse(cached));
      }
    }
    setRefreshing(false);
  };

  const handleBarcodeScanned = async (scanningResult) => {
    if (scanned || modalVisible) return;

    const { data, bounds } = scanningResult;

    // Check if barcode origin falls inside the target box on screen
    if (bounds && bounds.origin) {
      const { x, y } = bounds.origin;
      const isInsideBox =
        x >= BOX_X_MIN &&
        x <= BOX_X_MAX &&
        y >= BOX_Y_MIN &&
        y <= BOX_Y_MAX;

      if (!isInsideBox) {
        return; // Reject scans outside the target box
      }
    }

    setScanned(true); 
    setCurrentBarcode(data);
    setItemName('');
    setItemPrice('');
    setItemQuantity('1');
    setItemImageUrl('');
    setEditingItem(null);

    setModalVisible(true);
  };

  const openEditItem = (item) => {
    setEditingItem(item);
    setCurrentBarcode(item.barcode || '');
    setItemName(item.item_name || '');
    setItemPrice(item.price ? String(item.price) : '');
    setItemQuantity(item.quantity ? String(item.quantity) : '1');
    setItemImageUrl(item.image_url || '');
    setModalVisible(true);
  };

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission required', 'We need access to your photos to attach item images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      try {
        setUploading(true);
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        const fileName = `item-${Date.now()}.jpg`;

        const { error } = await supabase.storage
          .from('inventory-images')
          .upload(fileName, blob, {
            contentType: 'image/jpeg',
          });

        if (error) throw error;

        const { data: publicUrlData } = supabase.storage
          .from('inventory-images')
          .getPublicUrl(fileName);

        if (publicUrlData && publicUrlData.publicUrl) {
          setItemImageUrl(publicUrlData.publicUrl);
        }
      } catch (e) {
        Alert.alert('Image upload failed', e.message);
      } finally {
        setUploading(false);
      }
    }
  };

  const saveItemToCloud = async () => {
    if (!itemName) return Alert.alert('Missing Name', 'Enter a product name.');
    setUploading(true);

    const payload = {
      barcode: currentBarcode,
      item_name: itemName,
      price: parseFloat(itemPrice) || 0.0,
      quantity: parseInt(itemQuantity) || 1,
      image_url: itemImageUrl || null,
    };

    try {
      if (editingItem) {
        await supabase
          .from('inventory')
          .update(payload)
          .eq('id', editingItem.id);
      } else {
        await supabase
          .from('inventory')
          .upsert([payload], { onConflict: 'barcode' });
      }
    } catch (e) {
      Alert.alert('Save failed', e.message);
    }

    setUploading(false);
    setModalVisible(false);
    setScanned(false);
    setEditingItem(null);
    fetchInventory();
  };

  const deleteItem = async (itemId) => {
    Alert.alert('Delete item', 'Are you sure you want to delete this item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await supabase.from('inventory').delete().eq('id', itemId);
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
      await supabase
        .from('inventory')
        .update({ quantity: (item.quantity || 0) + 1 })
        .eq('id', item.id);
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
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.authContainer}>
          <Text style={styles.authTitle}>⚡ ScanPulse Mobile</Text>
          <Text style={styles.authSubtitle}>
            {isSignUpMode ? 'Create a new profile to get started' : 'Sign in to scan barcodes'}
          </Text>
          
          <TextInput
            style={styles.authInput}
            placeholder="Email"
            placeholderTextColor="#8e8e93"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.authInput}
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
      </TouchableWithoutFeedback>
    );
  }

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="light-content" />
      
      <Modal visible={modalVisible} animationType="fade" transparent={true}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.modalOverlay}>
            <BlurView intensity={40} tint="dark" style={styles.modalBlur}>
              <Animatable.View animation="zoomIn" duration={300} style={styles.modalContent}>
                <Text style={styles.modalTitle}>
                  {editingItem ? '✏️ Edit Item' : '✨ New Item Detected'}
                </Text>
                <Text style={styles.modalBarcode}>ID: {currentBarcode}</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Product Name"
                  placeholderTextColor="#8e8e93"
                  value={itemName}
                  onChangeText={setItemName}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Price ($)"
                  placeholderTextColor="#8e8e93"
                  value={itemPrice}
                  onChangeText={setItemPrice}
                  keyboardType="numeric"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Quantity"
                  placeholderTextColor="#8e8e93"
                  value={itemQuantity}
                  onChangeText={setItemQuantity}
                  keyboardType="numeric"
                />

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#2c2c2e' }]}
                    onPress={pickImage}
                  >
                    <Text style={{ color: '#ffffff', fontWeight: '700' }}>
                      {itemImageUrl ? 'Change Image' : 'Add Image'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {itemImageUrl ? (
                  <Image
                    source={{ uri: itemImageUrl }}
                    style={{ width: '100%', height: 160, borderRadius: 12, marginBottom: 10 }}
                    resizeMode="cover"
                  />
                ) : null}

                {uploading ? (
                  <ActivityIndicator color="#3a86ff" />
                ) : (
                  <View style={styles.modalButtons}>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#2c2c2e' }]}
                      onPress={() => {
                        setModalVisible(false);
                        setScanned(false);
                        setEditingItem(null);
                      }}
                    >
                      <Text style={{ color: '#ff453a', fontWeight: '700' }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#3a86ff' }]}
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
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <View style={{ flex: 1 }}>
        {activeTab === 'scanner' ? (
          !permission ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator color="#3a86ff" />
            </View>
          ) : !permission.granted ? (
            <View style={styles.centerContainer}>
              <Text style={{ color: '#fff', marginBottom: 10 }}>Camera permission is required.</Text>
              <Button onPress={requestPermission} title="Enable Camera View" color="#3a86ff" />
            </View>
          ) : (
            <View style={styles.cameraWrapper}>
              <CameraView
                style={StyleSheet.absoluteFillObject}
                onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
                barcodeScannerSettings={{
                  barcodeTypes: [
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
                  ],
                }}
              />
              <View style={styles.overlayContainer} pointerEvents="none">
                <View style={styles.scanTargetBox} />
              </View>
            </View>
          )
        ) : (
          <FlatList
            data={filteredItems}
            keyExtractor={(item) => item.id.toString()}
            refreshing={refreshing}
            onRefresh={fetchInventory}
            contentContainerStyle={styles.inventoryContainer}
            ListHeaderComponent={
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <Text style={styles.tabHeading}>📦 Stockroom</Text>
                  <TouchableOpacity onPress={() => supabase.auth.signOut()}>
                    <Text style={{ color: '#ff453a', fontWeight: '700' }}>Sign Out</Text>
                  </TouchableOpacity>
                </View>

                <BlurView intensity={35} tint="dark" style={styles.glassCard}>
                  <Text style={styles.analyticsTitle}>📊 Inventory Dashboard</Text>
                  <Text style={styles.analyticsText}>Total units: {totalItems}</Text>
                  <Text style={styles.analyticsText}>Total value: ${totalValue.toFixed(2)}</Text>
                  {mostScanned ? (
                    <Text style={styles.analyticsText}>
                      Top item: {mostScanned.item_name} ({mostScanned.quantity} units)
                    </Text>
                  ) : (
                    <Text style={styles.analyticsText}>No items yet.</Text>
                  )}
                </BlurView>

                <BlurView intensity={30} tint="dark" style={styles.glassCard}>
                  <Text style={styles.analyticsTitle}>🔍 Search & Filters</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Search by name or barcode"
                    placeholderTextColor="#8e8e93"
                    value={search}
                    onChangeText={setSearch}
                  />
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="Min quantity"
                      placeholderTextColor="#8e8e93"
                      value={minQuantity}
                      onChangeText={setMinQuantity}
                      keyboardType="numeric"
                    />
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
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
              </>
            }
            renderItem={({ item }) => (
              <Animatable.View animation="fadeInUp" duration={400}>
                <BlurView intensity={25} tint="dark" style={styles.itemRow}>
                  <TouchableOpacity
                    style={{ flex: 1 }}
                    onPress={() => openEditItem(item)}
                    onLongPress={() => quickIncrementQuantity(item)}
                  >
                    <Text style={styles.itemNameText}>{item.item_name || 'Generic Asset'}</Text>
                    <Text style={styles.barcodeText}>#{item.barcode}</Text>
                    <Text style={styles.barcodeText}>
                      ${item.price?.toFixed(2) || '0.00'} · {item.quantity} units
                    </Text>
                    {item.image_url ? (
                      <Image
                        source={{ uri: item.image_url }}
                        style={{ width: '100%', height: 120, borderRadius: 10, marginTop: 8 }}
                        resizeMode="cover"
                      />
                    ) : null}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteItem(item.id)}>
                    <Text style={{ color: '#ff453a', fontWeight: '700' }}>Delete</Text>
                  </TouchableOpacity>
                </BlurView>
              </Animatable.View>
            )}
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
  authContainer: { flex: 1, backgroundColor: '#090d16', justifyContent: 'center', alignItems: 'center', padding: 24 },
  authTitle: { fontSize: 26, fontWeight: '900', color: '#fff', marginBottom: 6 },
  authSubtitle: { fontSize: 13, color: '#8e8e93', marginBottom: 24, textAlign: 'center' },
  authInput: { width: '100%', height: 48, borderColor: '#1f2937', borderWidth: 1.5, marginBottom: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#030712', color: '#ffffff' },
  submitBtn: { width: '100%', height: 48, backgroundColor: '#3a86ff', borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 6 },
  toggleRow: { flexDirection: 'row', marginTop: 16, alignItems: 'center' },
  toggleLink: { color: '#60a5fa', fontWeight: '800', fontSize: 13 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  cameraWrapper: { flex: 1 },
  input: { width: '100%', height: 48, borderColor: '#2c2c2e', borderWidth: 1.5, marginBottom: 14, paddingHorizontal: 14, borderRadius: 10, backgroundColor: 'rgba(28,28,30,0.7)', color: '#ffffff' },
  overlayContainer: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  scanTargetBox: { width: BOX_WIDTH, height: BOX_HEIGHT, borderWidth: 2, borderColor: '#3a86ff', borderRadius: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center' },
  modalBlur: { width: '88%', borderRadius: 20, overflow: 'hidden' },
  modalContent: { padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff', textAlign: 'center', marginBottom: 4 },
  modalBarcode: { fontSize: 11, color: '#8e8e93', marginBottom: 20, textAlign: 'center' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  actionBtn: { flex: 0.47, height: 46, justifyContent: 'center', alignItems: 'center', borderRadius: 10 },
  btnText: { color: '#ffffff', fontWeight: '700' },
  inventoryContainer: { padding: 20, paddingTop: 60, paddingBottom: 100 },
  tabHeading: { fontSize: 24, fontWeight: '800', color: '#ffffff', marginBottom: 10 },
  glassCard: { borderRadius: 18, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  analyticsTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff', marginBottom: 6 },
  analyticsText: { fontSize: 13, color: '#d1d1d6', marginTop: 2 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 16, borderRadius: 14, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  itemNameText: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
  barcodeText: { fontSize: 12, color: '#8e8e93', marginTop: 2 },
  tabBar: { flexDirection: 'row', height: 80, backgroundColor: 'rgba(10,10,12,0.9)', paddingBottom: 15, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  tabButton: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabButtonText: { fontSize: 14, color: '#8e8e93', fontWeight: '600' },
  activeTabText: { color: '#3a86ff' }
});