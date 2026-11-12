import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@mobile-core/auth";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { MATRIC_DANCE_CATEGORIES, MATRIC_STATUS_LABELS, matricDanceRequestSchema, type MatricStatus } from "@shared/matric-dance";

type Booking = { id:string; revision:number; details:{eventDate:string;pickupTime:string;vehicleType:string;venueAddress:string}; status:MatricStatus; quoteAmount:number|null; adminNote:string };
function Field({ label, value, onChangeText, placeholder, numeric=false, multiline=false }: {label:string;value:string;onChangeText:(value:string)=>void;placeholder?:string;numeric?:boolean;multiline?:boolean}) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} style={[styles.input,multiline&&{minHeight:80}]} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={Colors.textMuted} keyboardType={numeric?"number-pad":"default"} multiline={multiline} /></View>;
}
export default function MatricDanceScreen() {
  const insets=useSafeAreaInsets();const {user}=useAuth();
  const [form,setForm]=useState({contactName:user?.name||"",contactPhone:user?.phone||"",school:"",eventDate:"",pickupTime:"",pickupAddress:"",venueAddress:"",vehicleType:"luxury_van",preferredModel:"",passengers:"2",serviceHours:"2",photoMinutes:"30",returnRequested:false,returnDate:"",returnTime:"",notes:"",adultContactConfirmed:false});
  const [expanded,setExpanded]=useState(false),[ready,setReady]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(""),[submitting,setSubmitting]=useState(false),[bookings,setBookings]=useState<Booking[]>([]),[busyId,setBusyId]=useState<string|null>(null);
  const set=(key:keyof typeof form,value:string|boolean)=>setForm(old=>({...old,[key]:value}));
  async function load() {setLoading(true);setError("");try {await apiRequest("GET","/api/matric-dance/options");setReady(true);const res=await apiRequest("GET","/api/matric-dance/bookings/me");setBookings(await res.json());}catch{setError("Could not load matric dance requests. Please retry when connected.");}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]);
  async function submit() {
    const value={...form,passengers:Number(form.passengers),serviceHours:Number(form.serviceHours),photoMinutes:Number(form.photoMinutes),returnDate:form.returnDate||undefined,returnTime:form.returnTime||undefined};
    const parsed=matricDanceRequestSchema.safeParse(value);if(!parsed.success){setError(parsed.error.issues[0].message);return;}
    setSubmitting(true);setError("");try {await apiRequest("POST","/api/matric-dance/bookings",parsed.data);setExpanded(false);Alert.alert("Request received","A2B will review your date, vehicle and itinerary before quoting. No payment has been taken and your car is not yet confirmed.");await load();}catch(e:any){setError(e?.message?.replace(/^\d+:\s*/,"")||"Could not send your request. Please retry.");}finally{setSubmitting(false);}
  }
  function changeBooking(booking:Booking,action:"accept"|"cancel") {
    Alert.alert(action==="accept"?"Accept this quote?":"Cancel this request?",action==="accept"?`R ${Number(booking.quoteAmount).toFixed(2)}\n${booking.adminNote}\n\nNo payment will be taken. A2B must still confirm your booking.`:"This cancels your unconfirmed request.",[{text:"Go back",style:"cancel"},{text:action==="accept"?"Accept quote":"Cancel request",onPress:async()=>{setBusyId(booking.id);try{await apiRequest("POST",`/api/matric-dance/bookings/${booking.id}/${action}`,action==="accept"?{expectedRevision:booking.revision}:{});await load();}catch(e:any){setError(e?.message||"Unable to update request");}finally{setBusyId(null);}}}]);
  }
  return <View style={[styles.screen,{paddingTop:insets.top}]}>
    <View style={styles.header}><Pressable accessibilityLabel="Go back" onPress={()=>router.back()} hitSlop={12}><Ionicons name="arrow-back" size={24} color={Colors.white}/></Pressable><Text style={styles.headerTitle}>Matric dance</Text></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom:insets.bottom+32}}>
      <Image source={require("../../assets/images/matric-dance/sedan.jpg")} style={styles.hero} accessibilityLabel="South African matric dance couple beside a luxury sedan"/>
      <View style={styles.body}>
        <Text style={styles.title}>Your night. Your arrival.</Text><Text style={styles.copy}>Plan a chauffeured arrival for your matric dance. Choose a premium category and tell us about your school, venue and photo plans.</Text>
        <Text style={styles.section}>Choose your arrival</Text>
        {MATRIC_DANCE_CATEGORIES.map(c=><Pressable key={c.id} accessibilityRole="radio" accessibilityState={{checked:form.vehicleType===c.id}} onPress={()=>set("vehicleType",c.id)} style={[styles.category,form.vehicleType===c.id&&styles.selected]}><View style={{flex:1}}><Text style={styles.label}>{c.title}</Text><Text style={styles.muted}>{c.description} · Up to {c.maxPassengers}</Text></View><Ionicons name={form.vehicleType===c.id?"radio-button-on":"radio-button-off"} size={22} color={Colors.white}/></Pressable>)}
        <Image source={require("../../assets/images/matric-dance/vclass.jpg")} style={styles.secondary} accessibilityLabel="Matric dance couple beside a V-Class"/>
        <Text style={styles.section}>Plan the whole evening</Text><Text style={styles.copy}>Include your pickup and venue, arrival photos and any return collection. For a return after midnight, select the next date. All times are South Africa time (SAST).</Text>
        <Text style={styles.copy}>Request at least 24 hours ahead. Vehicle make, colour, availability, waiting time, distance, chauffeur and return arrangements are confirmed in your quote. Images are illustrative.</Text>
        <Text style={styles.note}>An adult (18+) must be the booking contact. A request is not a confirmed booking. A2B provides the quote and payment/cancellation terms before you accept; no payment is taken here.</Text>
        {!expanded&&<Pressable style={styles.primary} accessibilityRole="button" onPress={()=>{setExpanded(true);setError("");}}><Text style={styles.primaryText}>Plan my matric dance</Text></Pressable>}
        {expanded&&<View style={styles.form}>
          <Text style={styles.section}>Request your booking</Text>
          <Field label="Adult contact name" value={form.contactName} onChangeText={v=>set("contactName",v)}/><Field label="Contact phone" value={form.contactPhone} onChangeText={v=>set("contactPhone",v)} placeholder="+27…"/>
          <Field label="School / matric dance" value={form.school} onChangeText={v=>set("school",v)}/>
          <Field label="Pickup date (YYYY-MM-DD)" value={form.eventDate} onChangeText={v=>set("eventDate",v)} placeholder="2027-09-18"/>
          <Field label="Pickup time (HH:mm, SAST)" value={form.pickupTime} onChangeText={v=>set("pickupTime",v)} placeholder="16:30"/>
          <Field label="Pickup address" value={form.pickupAddress} onChangeText={v=>set("pickupAddress",v)}/><Field label="Venue name and address" value={form.venueAddress} onChangeText={v=>set("venueAddress",v)}/>
          <Field label="Passengers (including learner and partner)" value={form.passengers} onChangeText={v=>set("passengers",v)} numeric/>
          <Field label="Service duration requested (1–12 hours)" value={form.serviceHours} onChangeText={v=>set("serviceHours",v)} numeric/>
          <Field label="Photo time requested (0–120 minutes)" value={form.photoMinutes} onChangeText={v=>set("photoMinutes",v)} numeric/>
          <Field label="Preferred model / colour (optional)" value={form.preferredModel} onChangeText={v=>set("preferredModel",v)} placeholder="For example, S-Class — subject to availability"/>
          <Pressable accessibilityRole="checkbox" accessibilityState={{checked:form.returnRequested}} onPress={()=>set("returnRequested",!form.returnRequested)} style={styles.check}><Ionicons name={form.returnRequested?"checkbox":"square-outline"} size={23} color={Colors.white}/><Text style={styles.checkText}>Include a return collection</Text></Pressable>
          {form.returnRequested&&<><Field label="Return date (YYYY-MM-DD)" value={form.returnDate} onChangeText={v=>set("returnDate",v)} placeholder="Same date if left empty"/><Field label="Return time (HH:mm, SAST)" value={form.returnTime} onChangeText={v=>set("returnTime",v)} placeholder="23:30"/></>}
          <Field label="Extra stops / accessibility / other details (optional)" value={form.notes} onChangeText={v=>set("notes",v)} multiline/>
          <Pressable accessibilityRole="checkbox" accessibilityState={{checked:form.adultContactConfirmed}} onPress={()=>set("adultContactConfirmed",!form.adultContactConfirmed)} style={styles.check}><Ionicons name={form.adultContactConfirmed?"checkbox":"square-outline"} size={23} color={Colors.white}/><Text style={styles.checkText}>I am 18 or older and responsible for this booking request.</Text></Pressable>
          <Pressable style={[styles.primary,(!ready||submitting)&&{opacity:0.5}]} disabled={!ready||submitting} onPress={submit}>{submitting?<ActivityIndicator color={Colors.primary}/>:<Text style={styles.primaryText}>Send booking request</Text>}</Pressable>
        </View>}
        {error?<View accessibilityRole="alert"><Text style={styles.error}>{error}</Text><Pressable style={styles.secondaryButton} onPress={load}><Text style={styles.label}>Retry loading</Text></Pressable></View>:null}
        <Text style={styles.section}>My matric dance requests</Text>
        {loading?<ActivityIndicator color={Colors.white}/>:bookings.length===0?<Text style={styles.muted}>No requests yet. Plan your evening above to get a quote.</Text>:bookings.map(b=><View key={b.id} style={styles.request}>
          <Text style={styles.label}>{MATRIC_STATUS_LABELS[b.status]||b.status}</Text><Text style={styles.copy}>{b.details.eventDate} · {b.details.pickupTime} SAST{ "\n"}{b.details.venueAddress}</Text>
          {b.quoteAmount!=null&&<Text style={styles.label}>Quote: R {Number(b.quoteAmount).toFixed(2)}</Text>}{b.adminNote?<Text style={styles.copy}>{b.adminNote}</Text>:null}
          {b.status==="quoted"&&<Pressable disabled={busyId===b.id} style={styles.secondaryButton} onPress={()=>changeBooking(b,"accept")}><Text style={styles.label}>Review and accept quote</Text></Pressable>}
          {["requested","reviewing","quoted","accepted"].includes(b.status)&&<Pressable disabled={busyId===b.id} style={styles.secondaryButton} onPress={()=>changeBooking(b,"cancel")}><Text style={styles.muted}>{busyId===b.id?"Updating…":"Cancel request"}</Text></Pressable>}
          {b.status==="confirmed"&&<Text style={styles.muted}>Contact A2B for any changes to a confirmed booking.</Text>}
        </View>)}
      </View>
    </ScrollView>
  </View>;
}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:Colors.primary},header:{flexDirection:"row",alignItems:"center",gap:16,padding:18},headerTitle:{fontFamily:"Inter_600SemiBold",fontSize:18,color:Colors.white},hero:{width:"100%",height:260,resizeMode:"cover"},body:{padding:20,gap:16},title:{fontFamily:"Inter_700Bold",fontSize:30,color:Colors.white},section:{fontFamily:"Inter_600SemiBold",fontSize:20,color:Colors.white,marginTop:12},copy:{fontFamily:"Inter_400Regular",fontSize:14,lineHeight:22,color:Colors.textSecondary},muted:{fontFamily:"Inter_400Regular",fontSize:13,lineHeight:20,color:Colors.textMuted},category:{padding:16,borderRadius:12,borderWidth:1,borderColor:Colors.border,backgroundColor:Colors.card,flexDirection:"row",gap:12,alignItems:"center"},selected:{borderColor:Colors.white},label:{fontFamily:"Inter_600SemiBold",fontSize:14,color:Colors.white},secondary:{width:"100%",height:210,borderRadius:12,resizeMode:"cover"},note:{fontFamily:"Inter_400Regular",fontSize:13,lineHeight:21,color:Colors.textSecondary,padding:16,backgroundColor:Colors.card,borderRadius:12},primary:{minHeight:50,borderRadius:10,backgroundColor:Colors.white,alignItems:"center",justifyContent:"center",padding:14},primaryText:{fontFamily:"Inter_600SemiBold",fontSize:15,color:Colors.primary},form:{gap:16},field:{gap:8},input:{minHeight:48,padding:12,borderWidth:1,borderColor:Colors.border,borderRadius:10,color:Colors.white,fontFamily:"Inter_400Regular",fontSize:15,backgroundColor:Colors.card},check:{flexDirection:"row",alignItems:"center",gap:12,minHeight:48},checkText:{flex:1,color:Colors.textSecondary,fontFamily:"Inter_400Regular",fontSize:14,lineHeight:21},error:{color:Colors.error,fontSize:14,lineHeight:22},request:{backgroundColor:Colors.card,padding:16,borderRadius:12,gap:12},secondaryButton:{paddingVertical:12,minHeight:44},
});
