import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "../context/WalletContext.js";
import { useToast } from "../context/ToastContext.js";
import { depositOptions } from "../lib/transactionPolicy.js";
import type { ProtocolId } from "../types/yield.js";
export function useDeposit() {
  const {callContract,address}=useWallet(); const {show}=useToast(); const qc=useQueryClient();
  return useMutation({mutationFn:async ({protocol,amountSats,reviewedMaxFeeBps}:{protocol:ProtocolId;amountSats:bigint;reviewedMaxFeeBps:number})=>{
    if(!address) throw new Error("Wallet not connected");
    return callContract({...await depositOptions(address,protocol,amountSats,reviewedMaxFeeBps),expectedSender:address});
  },onSuccess:(txid)=>{show({variant:"pending",message:"Deposit submitted. Check the transaction for confirmation or failure.",txid});void qc.invalidateQueries({queryKey:["position",address]});void qc.invalidateQueries({queryKey:["balance",address]});},
  onError:(err:unknown)=>show({variant:"error",message:err instanceof Error?err.message:"Deposit failed"})});
}
