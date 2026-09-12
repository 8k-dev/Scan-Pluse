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
  Keyboard 
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

  // Authentication Interface States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUpMode, setIsSignUpMode] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [currentBarcode, setCurrentBarcode] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemQuantity, setItemQuantity] = useState('1');
  const [uploading, setUploading] = useState(false);

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
    const { data } = await supabase.from('inventory').select('*').order('scanned_at', { ascending: false });
    if (data) setDbItems(data);
    setRefreshing(false);
  };

  const handleBarcodeScanned = ({ data }) => {
    if (scanned || modalVisible) return;
    setScanned(true); 
    setCurrentBarcode(data);
    setItemName(''); setItemPrice(''); setItemQuantity('1');
    setModalVisible(true);
  };

  const saveItemToCloud = async () => {
    if (!itemName) return Alert.alert('Missing Name', 'Enter a product name.');
    setUploading(true);
    await supabase.from('inventory').upsert([{ 
      barcode: currentBarcode, item_name: itemName,
      price: parseFloat(itemPrice) || 0.00, quantity: parseInt(itemQuantity) || 1
    }], { onConflict: 'barcode' });

    setUploading(false); setModalVisible(false); setScanned(false);
    fetchInventory();
  };

  if (!session) {
    return (
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.authContainer}>
          <Text style={styles.authTitle}>⚡ ScanPulse Mobile</Text>
          <Text style={styles.authSubtitle}>
            {isSignUpMode ? 'Create a new profile to get started' : 'Sign in to scan barcodes'}
          </Text>
          
          <TextInput style={styles.authInput} placeholder="Email" placeholderTextColor="#8e8e93" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <TextInput style={styles.authInput} placeholder="Password" placeholderTextColor="#8e8e93" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
          
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
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>✨ New Item Detected</Text>
              <Text style={styles.modalBarcode}>ID: {currentBarcode}</Text>
              <TextInput style={styles.input} placeholder="Product Name" placeholderTextColor="#8e8e93" value={itemName} onChangeText={setItemName} />
              <TextInput style={styles.input} placeholder="Price ($)" placeholderTextColor="#8e8e93" value={itemPrice} onChangeText={setItemPrice} keyboardType="numeric" />
              <TextInput style={styles.input} placeholder="Quantity" placeholderTextColor="#8e8e93" value={itemQuantity} onChangeText={setItemQuantity} keyboardType="numeric" />

              {uploading ? <ActivityIndicator color="#3a86ff" /> : (
                <View style={styles.modalButtons}>
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#2c2c2e' }]} onPress={() => { setModalVisible(false); setScanned(false); }}>
                    <Text style={{ color: '#ff453a', fontWeight: '700' }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#3a86ff' }]} onPress={saveItemToCloud}>
                    <Text style={styles.btnText}>Save Stock</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <View style={{ flex: 1 }}>
        {activeTab === 'scanner' ? (
          (!permission || !permission.granted) ? (
            <View style={styles.centerContainer}>
              <Button onPress={requestPermission} title="Enable Camera View" color="#3a86ff" />
            </View>
          ) : (
            <View style={styles.cameraWrapper}>
              <CameraView style={StyleSheet.absoluteFillObject} onBarcodeScanned={scanned ? undefined : handleBarcodeScanned} />
              <View style={styles.overlayContainer}>
                <View style={styles.scanTargetBox} />
              </View>
            </View>
          )
        ) : (
          <View style={styles.inventoryContainer}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={styles.tabHeading}>📦 Stockroom</Text>
              <TouchableOpacity onPress={() => supabase.auth.signOut()}>
                <Text style={{ color: '#ff453a', fontWeight: '700' }}>Sign Out</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={dbItems}
              keyExtractor={(item) => item.id.toString()}
              refreshing={refreshing}
              onRefresh={fetchInventory}
              renderItem={({ item }) => (
                <View style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemNameText}>{item.item_name || 'Generic Asset'}</Text>
                    <Text style={styles.barcodeText}>#{item.barcode}</Text>
                  </View>
                  <Text style={{ color: '#3a86ff', fontWeight: '800' }}>{item.quantity} units</Text>
                </View>
              )}
            />
          </View>
        )}
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabButton} onPress={() => setActiveTab('scanner')}>
          <Text style={[styles.tabButtonText, activeTab === 'scanner' && styles.activeTabText]}>📷 Scan</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabButton} onPress={() => setActiveTab('inventory')}>
          <Text style={[styles.tabButtonText, activeTab === 'inventory' && styles.activeTabText]}>📦 Vault</Text>
        </TouchableOpacity>
      </View>
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
  input: { width: '100%', height: 48, borderColor: '#2c2c2e', borderWidth: 1.5, marginBottom: 14, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#1c1c1e', color: '#ffffff' },
  overlayContainer: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  scanTargetBox: { width: 250, height: 150, borderWidth: 3, borderColor: '#3a86ff', borderRadius: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '88%', backgroundColor: '#1c1c1e', padding: 24, borderRadius: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff', textAlign: 'center', marginBottom: 4 },
  modalBarcode: { fontSize: 11, color: '#8e8e93', marginBottom: 20, textAlign: 'center' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  actionBtn: { flex: 0.47, height: 46, justifyContent: 'center', alignItems: 'center', borderRadius: 10 },
  btnText: { color: '#ffffff', fontWeight: '700' },
  inventoryContainer: { flex: 1, padding: 20, paddingTop: 60 },
  tabHeading: { fontSize: 24, fontWeight: '800', color: '#ffffff' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1c1c1e', padding: 16, borderRadius: 14, marginBottom: 12 },
  itemNameText: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
  barcodeText: { fontSize: 12, color: '#8e8e93', marginTop: 2 },
  tabBar: { flexDirection: 'row', height: 80, backgroundColor: '#0a0a0c', paddingBottom: 15 },
  tabButton: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabButtonText: { fontSize: 14, color: '#8e8e93', fontWeight: '600' },
  activeTabText: { color: '#3a86ff' }
});